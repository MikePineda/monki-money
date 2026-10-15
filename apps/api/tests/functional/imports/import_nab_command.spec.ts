import { test } from '@japa/runner'
import ImportNab from '#commands/import_nab'
import ImportRow from '#models/import_row'
import ImportBatch from '#models/import_batch'
import Transaction from '#models/transaction'
import ace from '@adonisjs/core/services/ace'
import app from '@adonisjs/core/services/app'
import drive from '@adonisjs/drive/services/main'
import { freezeClock } from '#tests/helpers/ledger'
import { TransactionFactory } from '#database/factories/transaction_factory'
import { EVERYDAY_NUMBER, countOf, nabHousehold } from '#tests/helpers/imports'

const TODAY = '2026-10-15T09:00:00+10:00'
const SAMPLE = app.makePath('tests/fixtures/nab/sample.csv')

test.group('Imports: import:nab command', (group) => {
  group.each.setup(() => {
    drive.fake()
    ace.ui.switchMode('raw')
    const restoreClock = freezeClock(TODAY)
    return () => {
      ace.ui.switchMode('normal')
      drive.restore()
      restoreClock()
    }
  })

  test('test_import_nab_stages_and_prints_a_summary', async ({ assert }) => {
    const home = await nabHousehold()

    const command = await ace.create(ImportNab, [
      SAMPLE,
      '--account',
      EVERYDAY_NUMBER,
      '--household',
      String(home.household.id),
    ])
    await command.exec()

    command.assertSucceeded()
    const batch = await ImportBatch.query().where('household_id', home.household.id).firstOrFail()
    assert.equal(batch.status, 'staged')
    assert.equal(batch.newCount, 29)
    assert.equal(await countOf(Transaction.query().where('household_id', home.household.id)), 0)
    command.assertLogMatches(/29/)
  })

  test('test_import_nab_confirm_auto_leaves_doubtful_rows_for_the_ui', async ({ assert }) => {
    const home = await nabHousehold()
    await TransactionFactory.merge({
      householdId: home.household.id,
      accountId: home.everyday.id,
      date: '2026-09-19',
      amountCents: -16_340,
      payee: 'FreshCo Market Northvale',
      paidByUserId: home.member.id,
    }).createMany(2)

    const command = await ace.create(ImportNab, [
      SAMPLE,
      '--account',
      String(home.everyday.id),
      '--household',
      String(home.household.id),
      '--confirm-auto',
    ])
    await command.exec()

    command.assertSucceeded()
    const batch = await ImportBatch.query().where('household_id', home.household.id).firstOrFail()
    assert.equal(batch.status, 'staged', 'the ambiguous row still waits for a person')
    const open = await ImportRow.query()
      .where('import_batch_id', batch.id)
      .whereNull('confirmed_at')
    assert.deepEqual(
      open.map((row) => row.resolution),
      ['needs_confirmation']
    )
    // 28 new rows + 4 transfer legs in the everyday account, plus the two manual twins.
    assert.equal(await countOf(Transaction.query().where('account_id', home.everyday.id)), 34)
  })

  test('test_import_nab_fails_for_an_unknown_household_or_account', async () => {
    const home = await nabHousehold()

    const noHousehold = await ace.create(ImportNab, [
      SAMPLE,
      '--account',
      EVERYDAY_NUMBER,
      '--household',
      '999999',
    ])
    await noHousehold.exec()
    noHousehold.assertFailed()

    const noAccount = await ace.create(ImportNab, [
      SAMPLE,
      '--account',
      '000000000',
      '--household',
      String(home.household.id),
    ])
    await noAccount.exec()
    noAccount.assertFailed()
  })
})
