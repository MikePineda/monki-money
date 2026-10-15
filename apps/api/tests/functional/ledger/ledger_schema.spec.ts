import { test } from '@japa/runner'
import Account from '#models/account'
import Category from '#models/category'
import Transfer from '#models/transfer'
import Household from '#models/household'
import Transaction from '#models/transaction'
import db from '@adonisjs/lucid/services/db'
import TransactionSplit from '#models/transaction_split'
import { createHousehold } from '#tests/helpers/household'
import { TransactionFactory, TransferFactory } from '#database/factories/transaction_factory'

/** Runs `work` in a savepoint so an expected failure does not poison the test transaction. */
async function rejects(work: (trx: any) => Promise<unknown>) {
  let failed = false
  try {
    await db.transaction(async (trx) => {
      await work(trx)
    })
  } catch {
    failed = true
  }
  return failed
}

function row(householdId: number, accountId: number, overrides: Record<string, unknown> = {}) {
  return {
    household_id: householdId,
    account_id: accountId,
    kind: 'expense',
    date: '2026-10-01',
    amount_cents: -100,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  }
}

test.group('Ledger schema', () => {
  test('test_transfer_kind_requires_a_transfer_link_and_only_transfers_have_one', async ({
    assert,
  }) => {
    const { household, accounts } = await createHousehold({ accounts: [{}, {}] })
    const transfer = await TransferFactory.merge({
      householdId: household.id,
      fromAccountId: accounts[0].id,
      toAccountId: accounts[1].id,
    }).create()

    assert.isTrue(
      await rejects((trx) =>
        trx.table('transactions').insert(row(household.id, accounts[0].id, { kind: 'transfer' }))
      )
    )
    assert.isTrue(
      await rejects((trx) =>
        trx
          .table('transactions')
          .insert(row(household.id, accounts[0].id, { transfer_id: transfer.id }))
      )
    )
  })

  test('test_split_transaction_cannot_have_its_own_category', async ({ assert }) => {
    const { household, accounts } = await createHousehold({ taxonomy: true, accounts: [{}] })
    const category = await Category.query().where('household_id', household.id).firstOrFail()

    assert.isTrue(
      await rejects((trx) =>
        trx
          .table('transactions')
          .insert(row(household.id, accounts[0].id, { is_split: true, category_id: category.id }))
      )
    )
  })

  test('test_transfer_amount_is_positive_and_accounts_differ', async ({ assert }) => {
    const { household, accounts } = await createHousehold({ accounts: [{}, {}] })
    const base = {
      household_id: household.id,
      date: '2026-10-01',
      created_at: new Date(),
      updated_at: new Date(),
    }

    assert.isTrue(
      await rejects((trx) =>
        trx.table('transfers').insert({
          ...base,
          amount_cents: 0,
          from_account_id: accounts[0].id,
          to_account_id: accounts[1].id,
        })
      )
    )
    assert.isTrue(
      await rejects((trx) =>
        trx.table('transfers').insert({
          ...base,
          amount_cents: 100,
          from_account_id: accounts[0].id,
          to_account_id: accounts[0].id,
        })
      )
    )
  })

  test('test_client_id_is_unique_per_household_only', async ({ assert }) => {
    const clientId = '0f8fad5b-d9cb-469f-a165-70867728950e'
    const first = await createHousehold({ accounts: [{}] })
    const second = await createHousehold({ accounts: [{}] })

    await TransactionFactory.merge({
      householdId: first.household.id,
      accountId: first.accounts[0].id,
      clientId,
    }).create()
    // Another household may reuse the same key.
    await TransactionFactory.merge({
      householdId: second.household.id,
      accountId: second.accounts[0].id,
      clientId,
    }).create()
    // Rows without a key never collide.
    await TransactionFactory.merge({
      householdId: first.household.id,
      accountId: first.accounts[0].id,
    }).createMany(2)

    assert.isTrue(
      await rejects((trx) =>
        trx
          .table('transactions')
          .insert(row(first.household.id, first.accounts[0].id, { client_id: clientId }))
      )
    )
  })

  test('test_tags_round_trip_as_a_json_array', async ({ assert }) => {
    const { household, accounts } = await createHousehold({ accounts: [{}] })

    const created = await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[0].id,
      tags: ['trip', 'beach'],
    }).create()

    const fresh = await Transaction.findOrFail(created.id)
    assert.deepEqual(fresh.tags, ['trip', 'beach'])
    const raw = await db.from('transactions').where('id', created.id).first()
    assert.deepEqual(raw.tags, ['trip', 'beach'])
  })

  test('test_factory_states_build_consistent_ledger_rows', async ({ assert }) => {
    const { household, accounts, owner } = await createHousehold({
      taxonomy: true,
      accounts: [{}, {}],
    })
    const base = { householdId: household.id, accountId: accounts[0].id }

    const leg = await TransactionFactory.merge({ ...base, amountCents: -5_000 })
      .apply('transfer')
      .create()
    const legs = await Transaction.query().where('transfer_id', leg.transferId!).orderBy('id')
    assert.deepEqual(
      legs.map((l) => [l.accountId, l.amountCents]),
      [
        [accounts[0].id, -5_000],
        [accounts[1].id, 5_000],
      ]
    )
    const transfer = await Transfer.findOrFail(leg.transferId)
    assert.equal(transfer.fromAccountId, accounts[0].id)
    assert.equal(transfer.amountCents, 5_000)

    const split = await TransactionFactory.merge({ ...base, amountCents: -1_001 })
      .apply('split')
      .create()
    const lines = await TransactionSplit.query().where('transaction_id', split.id)
    assert.lengthOf(lines, 2)
    assert.equal(
      lines.reduce((total, line) => total + line.amountCents, 0),
      -1_001
    )

    const imported = await TransactionFactory.merge({ ...base, paidByUserId: owner.id })
      .apply('imported', 'private', 'pending')
      .create()
    assert.equal(imported.source, 'import')
    assert.isTrue(imported.needsReview)
    assert.isTrue(imported.isPrivate)
    assert.equal(imported.status, 'pending')
    assert.isNotNull(imported.rawDescription)
  })

  test('test_deleting_a_household_cascades_the_ledger', async ({ assert }) => {
    const { household, accounts } = await createHousehold({ taxonomy: true, accounts: [{}, {}] })
    await TransactionFactory.merge({ householdId: household.id, accountId: accounts[0].id })
      .apply('split')
      .create()
    await TransferFactory.merge({
      householdId: household.id,
      fromAccountId: accounts[0].id,
      toAccountId: accounts[1].id,
    }).create()

    const doomed = await Household.findOrFail(household.id)
    await doomed.delete()

    assert.lengthOf(await Transaction.query().where('household_id', household.id), 0)
    assert.lengthOf(await Transfer.query().where('household_id', household.id), 0)
    assert.lengthOf(await Account.query().where('household_id', household.id), 0)
  })

  test('test_account_with_transactions_cannot_be_deleted_directly', async ({ assert }) => {
    const { household, accounts } = await createHousehold({ accounts: [{}] })
    await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[0].id,
    }).create()

    assert.isTrue(await rejects((trx) => trx.from('accounts').where('id', accounts[0].id).delete()))
  })
})
