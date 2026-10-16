import { test } from '@japa/runner'
import Account from '#models/account'
import ImportRow from '#models/import_row'
import ImportBatch from '#models/import_batch'
import Transaction from '#models/transaction'
import MerchantRule from '#models/merchant_rule'
import drive from '@adonisjs/drive/services/main'
import { freezeClock } from '#tests/helpers/ledger'
import { fixtureLines, nabCsv, nabFixture } from '#tests/helpers/importing'
import { TransactionFactory } from '#database/factories/transaction_factory'
import {
  EVERYDAY_NUMBER,
  countOf,
  SAVINGS_NUMBER,
  nabHousehold,
  nabLine,
  rowsStartingWith,
  uploadCsv,
} from '#tests/helpers/imports'

const TODAY = '2026-10-15T09:00:00+10:00'

test.group('Imports: staging', (group) => {
  group.each.setup(() => {
    drive.fake()
    const restoreClock = freezeClock(TODAY)
    return () => {
      drive.restore()
      restoreClock()
    }
  })

  test('test_upload_real_shaped_fixture_stages_all_rows', async ({ client, assert }) => {
    const home = await nabHousehold()

    const response = await uploadCsv(client, home.owner, nabFixture('sample.csv'), {
      filename: 'Transactions.csv',
    })

    response.assertStatus(201)
    const [batch] = response.body().data
    assert.lengthOf(response.body().data, 1)
    assert.include(batch, {
      accountId: home.everyday.id,
      status: 'staged',
      source: 'nab_csv',
      fileName: 'Transactions.csv',
      dateFrom: '2025-12-22',
      dateTo: '2026-09-27',
    })
    assert.deepEqual(batch.counts, {
      rows: 35,
      new: 29,
      autoMatched: 0,
      needsConfirmation: 0,
      duplicate: 0,
      transferLeg: 4,
      ignored: 2,
      superseded: 0,
    })
    assert.equal(batch.reconciliation.expectedBalanceCents, 764_275)
    assert.equal(await countOf(ImportRow.query().where('import_batch_id', batch.id)), 35)

    const detail = await client.get(`/api/v1/imports/${batch.id}`).actingAs(home.owner)
    detail.assertStatus(200)
    const rows = detail.body().data.rows
    assert.lengthOf(rows, 35)
    // Joint account: the card decides who paid; no card means both of us.
    assert.equal(rowsStartingWith(rows, 'V2222 19/09')[0].suggestedPaidByUserId, home.member.id)
    assert.equal(rowsStartingWith(rows, 'V1111 11/09')[0].suggestedPaidByUserId, home.owner.id)
    assert.isNull(rowsStartingWith(rows, 'INTERNET BPAY DEFT')[0].suggestedPaidByUserId)
    assert.include(rowsStartingWith(rows, 'V2222 07/08 FRESHCO')[0].suggestion, {
      source: 'nab_map',
      needsReview: false,
    })
    assert.include(rowsStartingWith(rows, 'Hnry - INV')[0].transfer, {
      accountId: home.hnry.id,
      signal: 'rule',
    })
    assert.include(rowsStartingWith(rows, 'ONLINE A1000000001')[0].transfer, {
      accountId: home.savings.id,
    })
    assert.isTrue(rowsStartingWith(rows, 'POS 27/09 TRANSLINK').every((r: any) => r.isPending))

    // Nothing reached the ledger yet; the household got the bank's default rules.
    assert.equal(await countOf(Transaction.query().where('account_id', home.everyday.id)), 0)
    const systemRules = await MerchantRule.query()
      .where('household_id', home.household.id)
      .where('origin', 'system')
    assert.lengthOf(systemRules, 8)
  })

  test('test_reimporting_same_file_creates_zero_new_rows', async ({ client, assert }) => {
    const home = await nabHousehold()
    const first = await uploadCsv(client, home.owner, nabFixture('sample.csv'))
    const batchId = first.body().data[0].id
    const confirmed = await client.post(`/api/v1/imports/${batchId}/confirm`).actingAs(home.owner)
    confirmed.assertStatus(200)
    const imported = () =>
      countOf(
        ImportRow.query()
          .where('household_id', home.household.id)
          .whereNot('resolution', 'duplicate')
      )
    const rowsBefore = await imported()
    const ledgerBefore = await countOf(Transaction.query().where('household_id', home.household.id))

    const again = await uploadCsv(client, home.owner, nabFixture('sample.csv'))

    again.assertStatus(201)
    const [batch] = again.body().data
    assert.equal(batch.status, 'completed', 'nothing left to review')
    assert.include(batch.counts, { rows: 35, duplicate: 35, new: 0, transferLeg: 0, ignored: 0 })
    assert.equal(await imported(), rowsBefore)
    const duplicates = await ImportRow.query().where('import_batch_id', batch.id)
    assert.lengthOf(duplicates, 35, 'every row is listed as a duplicate')
    assert.isTrue(duplicates.every((row) => row.resolution === 'duplicate'))
    assert.isTrue(duplicates.every((row) => row.transactionId === null))
    assert.equal(
      await countOf(Transaction.query().where('household_id', home.household.id)),
      ledgerBefore
    )
  })

  test('test_reimported_rows_are_listed_as_duplicates_of_their_ledger_rows', async ({
    client,
    assert,
  }) => {
    const home = await nabHousehold()
    const lines = fixtureLines('sample.csv')
    const older = await uploadCsv(client, home.owner, nabCsv(lines.slice(10)))
    const olderId = older.body().data[0].id
    await client.post(`/api/v1/imports/${olderId}/confirm`).actingAs(home.owner)
    const services = await Transaction.query()
      .where('account_id', home.everyday.id)
      .where('raw_description', 'like', 'V1111 02/09 SAMPLE SERVICES%')
      .firstOrFail()
    const ledgerBefore = await countOf(Transaction.query().where('household_id', home.household.id))

    const upload = await uploadCsv(client, home.owner, nabFixture('sample.csv'))

    upload.assertStatus(201)
    const batch = upload.body().data[0]
    assert.equal(batch.status, 'staged')
    assert.include(batch.counts, { rows: 35, duplicate: 25 })
    const listed = await client
      .get(`/api/v1/imports/${batch.id}?resolution=duplicate`)
      .actingAs(home.owner)
    const duplicates = listed.body().data.rows
    assert.lengthOf(duplicates, 25)
    const [copy] = rowsStartingWith(duplicates, 'V1111 02/09 SAMPLE SERVICES')
    assert.include(copy, { resolution: 'duplicate', transactionId: null, needsReview: false })
    assert.deepEqual(copy.reasons, ['duplicate_hash'])
    assert.isString(copy.confirmedAt, 'settled at staging: nothing to decide or confirm')
    assert.isNull(copy.suggestion)
    assert.deepInclude(copy.match, {
      transactionId: services.id,
      transaction: {
        date: services.date,
        amountCents: services.amountCents,
        payee: services.payee,
        source: 'import',
        status: 'cleared',
      },
    })

    const decided = await client
      .patch(`/api/v1/imports/${batch.id}/rows/${copy.id}`)
      .json({ resolution: 'new' })
      .actingAs(home.owner)
    decided.assertStatus(422)
    decided.assertBodyContains({ errors: [{ field: 'resolution', rule: 'duplicate' }] })
    const bulk = await client
      .patch(`/api/v1/imports/${batch.id}/rows`)
      .json({ changes: [{ rowId: copy.id, reset: true }] })
      .actingAs(home.owner)
    bulk.assertStatus(422)
    bulk.assertBodyContains({ errors: [{ field: 'changes.0.resolution', rule: 'duplicate' }] })

    const confirm = await client.post(`/api/v1/imports/${batch.id}/confirm`).actingAs(home.owner)

    confirm.assertStatus(200)
    assert.equal(confirm.body().data.remaining, 0)
    assert.equal(
      await countOf(
        Transaction.query()
          .where('account_id', home.everyday.id)
          .where('raw_description', 'like', 'V1111 02/09 SAMPLE SERVICES%')
      ),
      1,
      'a duplicate creates nothing'
    )
    assert.isAbove(
      await countOf(Transaction.query().where('household_id', home.household.id)),
      ledgerBefore
    )
    const after = await ImportRow.query()
      .where('import_batch_id', batch.id)
      .where('resolution', 'duplicate')
    assert.lengthOf(after, 25)
    assert.isTrue(after.every((row) => row.transactionId === null))
    const closed = await ImportBatch.findOrFail(batch.id)
    assert.include(closed.serialize(), { status: 'completed', duplicateCount: 25 })
  })

  test('test_show_without_rows_answers_only_the_batch', async ({ client, assert }) => {
    const home = await nabHousehold()
    const upload = await uploadCsv(client, home.owner, nabFixture('sample.csv'))
    const batchId = upload.body().data[0].id

    const summary = await client.get(`/api/v1/imports/${batchId}?rows=0`).actingAs(home.owner)

    summary.assertStatus(200)
    assert.notProperty(summary.body().data, 'rows')
    assert.include(summary.body().data, { id: batchId, status: 'staged', classifying: false })
    assert.equal(summary.body().data.counts.rows, 35)
    const detail = await client.get(`/api/v1/imports/${batchId}?rows=1`).actingAs(home.owner)
    assert.lengthOf(detail.body().data.rows, 35)
  })

  test('test_manual_entry_is_auto_matched_and_not_duplicated', async ({ client, assert }) => {
    const home = await nabHousehold()
    const manual = await client
      .post('/api/v1/transactions')
      .json({
        accountId: home.everyday.id,
        kind: 'expense',
        date: '2026-09-19',
        amountCents: 16_340,
        payee: 'FreshCo Market',
      })
      .actingAs(home.member)
    manual.assertStatus(201)
    const manualId = manual.body().data.id

    const upload = await uploadCsv(client, home.owner, nabFixture('sample.csv'))
    const batch = upload.body().data[0]
    assert.equal(batch.counts.autoMatched, 1)
    const detail = await client.get(`/api/v1/imports/${batch.id}`).actingAs(home.owner)
    const [row] = rowsStartingWith(detail.body().data.rows, 'V2222 19/09 FRESHCO')
    assert.equal(row.resolution, 'auto_matched')
    assert.include(row.match, { transactionId: manualId, upgradesPending: false })
    assert.isNull(row.suggestion, 'a matched row keeps the category typed by hand')

    const confirm = await client.post(`/api/v1/imports/${batch.id}/confirm`).actingAs(home.owner)

    confirm.assertStatus(200)
    assert.equal(confirm.body().data.matched, 1)
    const copies = await Transaction.query()
      .where('account_id', home.everyday.id)
      .where('amount_cents', -16_340)
    assert.lengthOf(copies, 1, 'the bank copy did not create a second transaction')
    assert.include(copies[0].serialize(), {
      id: manualId,
      source: 'manual',
      status: 'cleared',
      bankDate: '2026-09-21',
      rawDescription: 'V2222 19/09 FRESHCO MARKET NORTHVALE 70000000601',
      cardSuffix: '2222',
    })
    const linked = await ImportRow.findOrFail(row.id)
    assert.equal(linked.transactionId, manualId)
  })

  test('test_ambiguous_match_requires_confirmation', async ({ client, assert }) => {
    const home = await nabHousehold()
    const twins = await TransactionFactory.merge({
      householdId: home.household.id,
      accountId: home.everyday.id,
      date: '2026-09-19',
      amountCents: -16_340,
      payee: 'FreshCo Market Northvale',
      paidByUserId: home.member.id,
    }).createMany(2)

    const upload = await uploadCsv(client, home.owner, nabFixture('sample.csv'))
    const batch = upload.body().data[0]
    const detail = await client.get(`/api/v1/imports/${batch.id}`).actingAs(home.owner)
    const [row] = rowsStartingWith(detail.body().data.rows, 'V2222 19/09 FRESHCO')

    assert.equal(row.resolution, 'needs_confirmation')
    assert.include(row.reasons, 'possible_match')
    assert.include(
      twins.map((twin) => twin.id),
      row.match.transactionId
    )

    // Undecided rows block the confirm...
    const blocked = await client.post(`/api/v1/imports/${batch.id}/confirm`).actingAs(home.owner)
    blocked.assertStatus(422)
    blocked.assertBodyContains({ code: 'E_IMPORT_ROWS_UNDECIDED', rowIds: [row.id] })

    // ...until a person picks the right twin.
    const decide = await client
      .patch(`/api/v1/imports/${batch.id}/rows/${row.id}`)
      .json({ resolution: 'auto_matched', matchTransactionId: twins[1].id })
      .actingAs(home.owner)
    decide.assertStatus(200)
    decide.assertBodyContains({ data: { resolution: 'auto_matched' } })

    const confirm = await client.post(`/api/v1/imports/${batch.id}/confirm`).actingAs(home.owner)
    confirm.assertStatus(200)
    const linkedRow = await ImportRow.findOrFail(row.id)
    assert.equal(linkedRow.transactionId, twins[1].id)
    assert.lengthOf(
      await Transaction.query()
        .where('account_id', home.everyday.id)
        .where('amount_cents', -16_340),
      2
    )
  })

  test('test_internal_transfer_links_opposite_leg_in_other_account', async ({ client, assert }) => {
    const home = await nabHousehold()
    const savingsLeg = await TransactionFactory.merge({
      householdId: home.household.id,
      accountId: home.savings.id,
      kind: 'income',
      date: '2026-07-31',
      amountCents: 75_000,
      payee: null,
    }).create()

    const upload = await uploadCsv(client, home.owner, nabFixture('sample.csv'))
    const batch = upload.body().data[0]
    const detail = await client.get(`/api/v1/imports/${batch.id}`).actingAs(home.owner)
    const [row] = rowsStartingWith(detail.body().data.rows, 'ONLINE A1000000001')
    assert.equal(row.resolution, 'transfer_leg')
    assert.include(row.transfer, { accountId: home.savings.id, legTransactionId: savingsLeg.id })

    const confirm = await client.post(`/api/v1/imports/${batch.id}/confirm`).actingAs(home.owner)

    confirm.assertStatus(200)
    await savingsLeg.refresh()
    assert.equal(savingsLeg.kind, 'transfer')
    assert.isNotNull(savingsLeg.transferId)
    const legs = await Transaction.query().where('transfer_id', savingsLeg.transferId!)
    assert.sameDeepMembers(
      legs.map((leg) => [leg.accountId, leg.amountCents]),
      [
        [home.everyday.id, -75_000],
        [home.savings.id, 75_000],
      ]
    )
    assert.equal(
      await countOf(Transaction.query().where('account_id', home.savings.id)),
      2,
      'the savings leg was reused; only the other transfer (5.00) created one'
    )
  })

  test('test_one_upload_with_two_accounts_links_both_legs_once', async ({ client, assert }) => {
    const home = await nabHousehold({ savingsNumber: SAVINGS_NUMBER })
    const csv = nabCsv([
      nabLine({
        date: '01 Oct 26',
        amount: '-250.00',
        type: 'TRANSFER DEBIT',
        details: 'ONLINE C1000000010 Monthly saving',
        balance: '1000.00',
        category: 'Internal transfers',
      }),
      nabLine({
        date: '01 Oct 26',
        amount: '250.00',
        account: SAVINGS_NUMBER,
        type: 'TRANSFER CREDIT',
        details: 'ONLINE C1000000010 Monthly saving',
        balance: '5250.00',
        category: 'Internal transfers',
      }),
    ])

    const upload = await uploadCsv(client, home.owner, csv)

    upload.assertStatus(201)
    const batches = upload.body().data
    assert.sameMembers(
      batches.map((batch: any) => batch.accountId),
      [home.everyday.id, home.savings.id]
    )
    assert.isTrue(batches.every((batch: any) => batch.counts.transferLeg === 1))

    for (const batch of batches) {
      const confirm = await client.post(`/api/v1/imports/${batch.id}/confirm`).actingAs(home.owner)
      confirm.assertStatus(200)
    }
    const legs = await Transaction.query().where('household_id', home.household.id)
    assert.lengthOf(legs, 2, 'one transfer, two legs: the second batch linked the first leg')
    assert.equal(legs[0].transferId, legs[1].transferId)
    const rows = await ImportRow.query().where('household_id', home.household.id)
    assert.isTrue(rows.every((row) => row.transactionId !== null))
  })

  test('test_hnry_row_becomes_transfer_from_hnry_account', async ({ client, assert }) => {
    const home = await nabHousehold()
    const upload = await uploadCsv(client, home.owner, nabFixture('sample.csv'))
    const batch = upload.body().data[0]

    const confirm = await client.post(`/api/v1/imports/${batch.id}/confirm`).actingAs(home.owner)

    confirm.assertStatus(200)
    const incoming = await Transaction.query()
      .where('account_id', home.everyday.id)
      .where('amount_cents', 435_000)
      .firstOrFail()
    assert.equal(incoming.kind, 'transfer')
    assert.equal(incoming.source, 'import')
    const hnryLeg = await Transaction.query()
      .where('transfer_id', incoming.transferId!)
      .whereNot('id', incoming.id)
      .firstOrFail()
    assert.include(hnryLeg.serialize(), {
      accountId: home.hnry.id,
      amountCents: -435_000,
      date: '2026-07-31',
      kind: 'transfer',
    })
  })

  test('test_unknown_account_number_returns_422_with_mapping_hint', async ({ client, assert }) => {
    const home = await nabHousehold()
    home.everyday.externalAccountNumber = null
    await home.everyday.save()

    const unknown = await uploadCsv(client, home.owner, nabFixture('sample.csv'))

    unknown.assertStatus(422)
    unknown.assertBodyContains({
      code: 'E_IMPORT_UNKNOWN_ACCOUNTS',
      accountNumbers: [EVERYDAY_NUMBER],
    })
    assert.equal(await countOf(ImportBatch.query().where('household_id', home.household.id)), 0)

    // Mapping the file to an account remembers the number for next time.
    const mapped = await uploadCsv(client, home.owner, nabFixture('sample.csv'), {
      accountId: home.everyday.id,
    })
    mapped.assertStatus(201)
    const everyday = await Account.findOrFail(home.everyday.id)
    assert.equal(everyday.externalAccountNumber, EVERYDAY_NUMBER)
  })

  test('test_second_open_batch_for_same_account_returns_409', async ({ client, assert }) => {
    const home = await nabHousehold()
    const first = await uploadCsv(client, home.owner, nabFixture('sample.csv'))
    first.assertStatus(201)

    const second = await uploadCsv(client, home.member, nabFixture('sample.csv'))

    second.assertStatus(409)
    second.assertBodyContains({ code: 'E_IMPORT_BATCH_OPEN', batchId: first.body().data[0].id })
    assert.equal(await countOf(ImportBatch.query().where('household_id', home.household.id)), 1)
  })

  test('test_monthly_import_limit_returns_402', async ({ client, assert }) => {
    const home = await nabHousehold()
    // The free plan allows 30 batches a month (config/plans.ts).
    await ImportBatch.createMany(
      Array.from({ length: 30 }, (_, index) => ({
        householdId: home.household.id,
        accountId: home.savings.id,
        source: 'nab_csv' as const,
        status: 'cancelled' as const,
        fileHash: String(index).padStart(64, '0'),
      }))
    )

    const response = await uploadCsv(client, home.owner, nabFixture('sample.csv'))

    response.assertStatus(402)
    response.assertBodyContains({ code: 'E_IMPORT_LIMIT_REACHED' })
    assert.equal(await countOf(ImportRow.query().where('household_id', home.household.id)), 0)
  })

  test('test_csv_over_limit_is_rejected', async ({ client, assert }) => {
    const home = await nabHousehold()
    const line = nabLine({ date: '01 Oct 26', amount: '-1.00', details: 'X'.repeat(200) })
    const lines = Array.from(
      { length: Math.ceil((2 * 1024 * 1024) / line.length) + 10 },
      () => line
    )
    const huge = nabCsv(lines)
    assert.isAbove(huge.length, 2 * 1024 * 1024)

    const response = await uploadCsv(client, home.owner, huge)

    response.assertStatus(422)
    response.assertBodyContains({ code: 'E_CSV_TOO_LARGE' })
    assert.equal(await countOf(ImportBatch.query().where('household_id', home.household.id)), 0)
  })

  test('test_upload_without_a_file_or_with_a_foreign_format_is_rejected', async ({ client }) => {
    const home = await nabHousehold()

    const missing = await client
      .post('/api/v1/imports')
      .field('accountId', home.everyday.id)
      .actingAs(home.owner)
    missing.assertStatus(422)
    missing.assertBodyContains({ errors: [{ field: 'file', rule: 'required' }] })

    const foreign = await uploadCsv(client, home.owner, Buffer.from('a,b,c\n1,2,3\n'))
    foreign.assertStatus(422)
    foreign.assertBodyContains({ code: 'E_CSV_UNKNOWN_FORMAT' })
  })

  test('test_original_csv_is_stored_in_bucket', async ({ client, assert }) => {
    const home = await nabHousehold()
    const disk = drive.fake()
    const csv = nabFixture('sample.csv')

    const upload = await uploadCsv(client, home.owner, csv)

    upload.assertStatus(201)
    const batch = await ImportBatch.findOrFail(upload.body().data[0].id)
    const key = `imports/${home.household.id}/${batch.id}.csv`
    assert.equal(batch.filePath, key)
    disk.assertExists(key)
    assert.deepEqual(Buffer.from(await disk.getBytes(key)), csv)
  })

  test('test_cancel_removes_staged_rows', async ({ client, assert }) => {
    const home = await nabHousehold()
    const upload = await uploadCsv(client, home.owner, nabFixture('sample.csv'))
    const batchId = upload.body().data[0].id

    const cancel = await client.post(`/api/v1/imports/${batchId}/cancel`).actingAs(home.owner)

    cancel.assertStatus(200)
    cancel.assertBodyContains({ data: { id: batchId, status: 'cancelled' } })
    assert.equal(await countOf(ImportRow.query().where('import_batch_id', batchId)), 0)
    const again = await client.post(`/api/v1/imports/${batchId}/cancel`).actingAs(home.owner)
    again.assertStatus(409)
    again.assertBodyContains({ code: 'E_IMPORT_BATCH_CLOSED' })

    // The same file stages again from scratch: nothing was remembered.
    const retry = await uploadCsv(client, home.owner, nabFixture('sample.csv'))
    retry.assertStatus(201)
    assert.include(retry.body().data[0].counts, { new: 29, duplicate: 0 })
  })

  test('test_index_lists_the_household_batches_newest_first', async ({ client, assert }) => {
    const home = await nabHousehold()
    const first = await uploadCsv(client, home.owner, nabFixture('sample.csv'))
    await client.post(`/api/v1/imports/${first.body().data[0].id}/cancel`).actingAs(home.owner)
    const second = await uploadCsv(client, home.owner, nabFixture('sample.csv'))

    const index = await client.get('/api/v1/imports').actingAs(home.member)

    index.assertStatus(200)
    assert.deepEqual(
      index.body().data.map((batch: any) => [batch.id, batch.status]),
      [
        [second.body().data[0].id, 'staged'],
        [first.body().data[0].id, 'cancelled'],
      ]
    )
    const staged = await client.get('/api/v1/imports?status=staged').actingAs(home.member)
    assert.lengthOf(staged.body().data, 1)
  })
})
