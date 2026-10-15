import { test } from '@japa/runner'
import Transaction from '#models/transaction'
import { createHousehold } from '#tests/helpers/household'
import HouseholdExporter from '#services/households/household_exporter'
import LedgerCsvExporter from '#services/households/ledger_csv_exporter'
import { TransactionFactory } from '#database/factories/transaction_factory'

/**
 * Exports page through the ledger while people keep writing. Pages are
 * keyset-based, so a row added or removed mid-export never makes another
 * row appear twice or vanish.
 */
async function ledger() {
  const fixture = await createHousehold({ users: 2, accounts: [{}] })
  const rows = await TransactionFactory.merge(
    ['A', 'B', 'C', 'D'].map((letter, index) => ({
      householdId: fixture.household.id,
      accountId: fixture.accounts[0].id,
      date: `2026-10-0${index + 1}`,
      payee: `Row ${letter}`,
    }))
  ).createMany(4)
  const viewer = { userId: fixture.owner.id, memberIds: new Set(fixture.users.map((u) => u.id)) }
  return { ...fixture, rows, viewer }
}

test.group('Export pagination', () => {
  test('test_csv_export_neither_repeats_nor_skips_rows_inserted_mid_export', async ({ assert }) => {
    const { household, accounts, viewer } = await ledger()
    const chunks = new LedgerCsvExporter(2).csv(household, viewer)[Symbol.asyncIterator]()

    // Header + the first page (rows A and B).
    const output: string[] = []
    for (let index = 0; index < 3; index++) {
      const chunk = await chunks.next()
      output.push(chunk.value)
    }
    // An older purchase is saved while the export runs.
    await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[0].id,
      date: '2026-09-30',
      payee: 'Row Z',
    }).create()
    for (let chunk = await chunks.next(); !chunk.done; chunk = await chunks.next()) {
      output.push(chunk.value)
    }

    const text = output.join('')
    for (const letter of ['A', 'B', 'C', 'D']) {
      assert.equal(text.split(`Row ${letter}`).length - 1, 1, `Row ${letter}`)
    }
  })

  test('test_json_export_does_not_skip_rows_when_one_is_deleted_mid_export', async ({ assert }) => {
    const { household, rows, viewer } = await ledger()
    const chunks = new HouseholdExporter(2).json(household, viewer)[Symbol.asyncIterator]()

    const output: string[] = []
    let transactionsSeen = -1
    while (transactionsSeen < 2) {
      const next = await chunks.next()
      const chunk = next.value as string
      output.push(chunk)
      if (chunk === ',"transactions":[') transactionsSeen = 0
      else if (transactionsSeen >= 0) transactionsSeen++
    }
    // Row A (already exported) is deleted before the next page is read.
    await Transaction.query().where('id', rows[0].id).delete()
    for (let chunk = await chunks.next(); !chunk.done; chunk = await chunks.next()) {
      output.push(chunk.value)
    }

    const exported = JSON.parse(output.join('')).transactions.map((row: any) => row.id)
    assert.deepEqual(
      exported,
      rows.map((row) => row.id)
    )
  })
})
