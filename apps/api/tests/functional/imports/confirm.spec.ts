import { test } from '@japa/runner'
import Account from '#models/account'
import Category from '#models/category'
import ImportRow from '#models/import_row'
import ImportBatch from '#models/import_batch'
import Transaction from '#models/transaction'
import MerchantRule from '#models/merchant_rule'
import drive from '@adonisjs/drive/services/main'
import { categoryBySlug, freezeClock } from '#tests/helpers/ledger'
import { TransactionFactory } from '#database/factories/transaction_factory'
import { fixtureLines, nabCsv, nabFixture } from '#tests/helpers/importing'
import { countOf, nabHousehold, nabLine, rowsStartingWith, uploadCsv } from '#tests/helpers/imports'

const TODAY = '2026-10-15T09:00:00+10:00'

test.group('Imports: confirm', (group) => {
  group.each.setup(() => {
    drive.fake()
    const restoreClock = freezeClock(TODAY)
    return () => {
      drive.restore()
      restoreClock()
    }
  })

  test('test_confirm_creates_transactions_and_learns_rules', async ({ client, assert }) => {
    const home = await nabHousehold()
    const personalCare = await categoryBySlug(home.household.id, 'personal-care')
    const upload = await uploadCsv(client, home.owner, nabFixture('sample.csv'))
    const batch = upload.body().data[0]
    const detail = await client.get(`/api/v1/imports/${batch.id}`).actingAs(home.owner)
    const [services] = rowsStartingWith(detail.body().data.rows, 'V1111 02/09 SAMPLE SERVICES')
    const [cash] = rowsStartingWith(detail.body().data.rows, 'CASH')

    const decided = await client
      .patch(`/api/v1/imports/${batch.id}/rows/${services.id}`)
      .json({ categoryId: personalCare.id, payee: 'Barber' })
      .actingAs(home.owner)
    decided.assertStatus(200)
    decided.assertBodyContains({
      data: { decision: { categoryId: personalCare.id, payee: 'Barber' } },
    })
    await client
      .patch(`/api/v1/imports/${batch.id}/rows/${cash.id}`)
      .json({ resolution: 'ignored' })
      .actingAs(home.owner)

    const confirm = await client.post(`/api/v1/imports/${batch.id}/confirm`).actingAs(home.owner)

    confirm.assertStatus(200)
    assert.include(confirm.body().data, { created: 28, matched: 0, ignored: 3, transfers: 4 })
    const closed = await ImportBatch.findOrFail(batch.id)
    assert.equal(closed.status, 'completed')

    const ledger = await Transaction.query().where('account_id', home.everyday.id)
    assert.lengthOf(ledger, 28 + 4)
    const barber = ledger.find((row) => row.rawDescription?.startsWith('V1111 02/09'))!
    assert.include(barber.serialize(), {
      categoryId: personalCare.id,
      payee: 'Barber',
      kind: 'expense',
      amountCents: -630,
      source: 'import',
      status: 'cleared',
      bankDate: '2026-09-04',
      date: '2026-09-02',
      cardSuffix: '1111',
      paidByUserId: home.owner.id,
      needsReview: false,
      createdByUserId: home.owner.id,
    })
    const pending = ledger.filter((row) => row.status === 'pending')
    assert.lengthOf(pending, 3, 'every pending bank row except the two zero-amount checks')
    const refund = ledger.find((row) => row.rawDescription?.startsWith('REFUND-EFTPOS'))!
    assert.equal(refund.kind, 'income')
    assert.isTrue(refund.needsReview, 'a vague bank category stays in triage')

    const linked = await ImportRow.findOrFail(services.id)
    assert.equal(linked.transactionId, barber.id)
    assert.isNotNull(linked.confirmedAt)

    // The person's correction and the bank map's guesses become rules.
    const learned = await MerchantRule.query()
      .where('household_id', home.household.id)
      .where('origin', 'learned')
    const servicesRule = learned.find((rule) => rule.pattern === services.merchantFullKey)
    assert.include(servicesRule?.serialize(), {
      matchType: 'merchant',
      categoryId: personalCare.id,
    })
    const groceries = await categoryBySlug(home.household.id, 'groceries')
    assert.isTrue(learned.some((rule) => rule.categoryId === groceries.id))
    // Rows a system rule already decided teach nothing new.
    const rent = await categoryBySlug(home.household.id, 'rent')
    assert.isFalse(learned.some((rule) => rule.categoryId === rent.id))
  })

  test('test_confirm_is_atomic_on_failure', async ({ client, assert }) => {
    const home = await nabHousehold()
    const food = await categoryBySlug(home.household.id, 'groceries')
    const temporary = await Category.create({
      householdId: home.household.id,
      categoryGroupId: food.categoryGroupId,
      name: 'Temporary',
      slug: 'temporary',
    })
    const csv = nabCsv([
      nabLine({
        date: '02 Oct 26',
        amount: '-12.00',
        details: 'V1111 01/10 CORNER BAKERY SAMPLEVILLE 70000000901',
        balance: '988.00',
        category: 'Restaurants & takeaway',
        merchant: 'Corner Bakery',
      }),
      nabLine({
        date: '01 Oct 26',
        amount: '-30.00',
        details: 'V2222 30/09 MYSTERY SHOP SAMPLEVILLE 70000000902',
        balance: '1000.00',
        category: 'Uncategorised',
      }),
    ])
    const upload = await uploadCsv(client, home.owner, csv)
    const batch = upload.body().data[0]
    const detail = await client.get(`/api/v1/imports/${batch.id}`).actingAs(home.owner)
    const [mystery] = rowsStartingWith(detail.body().data.rows, 'V2222 30/09')
    await client
      .patch(`/api/v1/imports/${batch.id}/rows/${mystery.id}`)
      .json({ categoryId: temporary.id })
      .actingAs(home.owner)
      .then((response) => response.assertStatus(200))
    // The category disappears between the decision and the confirm.
    await temporary.delete()

    const confirm = await client.post(`/api/v1/imports/${batch.id}/confirm`).actingAs(home.owner)

    confirm.assertStatus(422)
    confirm.assertBodyContains({ errors: [{ field: 'categoryId', rule: 'database.exists' }] })
    assert.equal(await countOf(Transaction.query().where('household_id', home.household.id)), 0)
    const stillStaged = await ImportBatch.findOrFail(batch.id)
    assert.equal(stillStaged.status, 'staged')
    const rows = await ImportRow.query().where('import_batch_id', batch.id)
    assert.isTrue(rows.every((row) => row.confirmedAt === null && row.transactionId === null))
    assert.equal(
      await countOf(
        MerchantRule.query().where('household_id', home.household.id).where('origin', 'learned')
      ),
      0
    )
  })

  test('test_confirm_reports_balance_reconciliation', async ({ client, assert }) => {
    const home = await nabHousehold()
    const first = await uploadCsv(client, home.owner, nabFixture('sample.csv'))

    const confirm = await client
      .post(`/api/v1/imports/${first.body().data[0].id}/confirm`)
      .actingAs(home.owner)

    confirm.assertStatus(200)
    assert.deepInclude(confirm.body().data.reconciliation, {
      expectedBalanceCents: 764_275,
      computedBalanceCents: 764_275,
      differenceCents: 0,
      balanced: true,
      missingBefore: null,
    })

    // A later export whose balance skips money the ledger never saw.
    const next = nabCsv([
      nabLine({
        date: '10 Oct 26',
        amount: '-10.00',
        details: 'V1111 09/10 CORNER BAKERY SAMPLEVILLE 70000000903',
        balance: '7000.00',
        category: 'Restaurants & takeaway',
        merchant: 'Corner Bakery',
      }),
    ])
    const second = await uploadCsv(client, home.owner, next)
    const reconciled = await client
      .post(`/api/v1/imports/${second.body().data[0].id}/confirm`)
      .actingAs(home.owner)

    assert.deepInclude(reconciled.body().data.reconciliation, {
      expectedBalanceCents: 700_000,
      computedBalanceCents: 763_275,
      differenceCents: -63_275,
      balanced: false,
      missingBefore: '2026-10-10',
    })
  })

  test('test_opening_balance_is_derived_from_first_import', async ({ client, assert }) => {
    const home = await nabHousehold()
    const upload = await uploadCsv(client, home.owner, nabFixture('sample.csv'))
    const batch = upload.body().data[0]
    assert.equal(batch.reconciliation.openingBalanceCents, 138_000)

    await client.post(`/api/v1/imports/${batch.id}/confirm`).actingAs(home.owner)

    const everyday = await Account.findOrFail(home.everyday.id)
    assert.equal(everyday.openingBalanceCents, 138_000)
    assert.equal(everyday.openingBalanceDate, '2025-12-21', 'the day before the oldest movement')
    const balances = await client.get('/api/v1/reports/balances').actingAs(home.owner)
    const row = balances
      .body()
      .data.accounts.find((account: any) => account.accountId === home.everyday.id)
    assert.equal(row.availableBalanceCents, 764_275)

    // Later imports never touch it again.
    const later = nabCsv([
      nabLine({
        date: '10 Oct 26',
        amount: '-10.00',
        details: 'V1111 09/10 CORNER BAKERY SAMPLEVILLE 70000000903',
        balance: '7632.75',
        category: 'Restaurants & takeaway',
      }),
    ])
    const second = await uploadCsv(client, home.owner, later)
    assert.isNull(second.body().data[0].reconciliation.openingBalanceCents)
    const done = await client
      .post(`/api/v1/imports/${second.body().data[0].id}/confirm`)
      .actingAs(home.owner)
    assert.isTrue(done.body().data.reconciliation.balanced)
    await everyday.refresh()
    assert.equal(everyday.openingBalanceCents, 138_000)
  })

  test('test_pending_row_is_upgraded_on_next_import', async ({ client, assert }) => {
    const home = await nabHousehold()
    const [pendingLine, postedLine] = fixtureLines('pending-then-posted.csv')

    const first = await uploadCsv(client, home.owner, nabCsv([pendingLine]))
    const firstBatch = first.body().data[0]
    const firstConfirm = await client
      .post(`/api/v1/imports/${firstBatch.id}/confirm`)
      .actingAs(home.owner)
    assert.isTrue(firstConfirm.body().data.reconciliation.balanced)
    const pending = await Transaction.query().where('account_id', home.everyday.id).firstOrFail()
    assert.equal(pending.status, 'pending')
    const pendingRow = await ImportRow.query().where('import_batch_id', firstBatch.id).firstOrFail()

    const second = await uploadCsv(client, home.owner, nabCsv([postedLine]))
    const secondBatch = second.body().data[0]
    const detail = await client.get(`/api/v1/imports/${secondBatch.id}`).actingAs(home.owner)
    const [posted] = detail.body().data.rows
    assert.equal(posted.resolution, 'auto_matched')
    assert.include(posted.match, { transactionId: pending.id, upgradesPending: true })
    await pending.refresh()
    assert.isFalse(pending.needsReview, 'its posted copy is right here: not stale')

    const confirm = await client
      .post(`/api/v1/imports/${secondBatch.id}/confirm`)
      .actingAs(home.owner)

    confirm.assertStatus(200)
    assert.deepInclude(confirm.body().data.reconciliation, {
      expectedBalanceCents: 49_400,
      computedBalanceCents: 49_400,
      balanced: true,
    })
    const ledger = await Transaction.query().where('account_id', home.everyday.id)
    assert.lengthOf(ledger, 1, 'the posted row replaced the pending one, it did not add one')
    assert.include(ledger[0].serialize(), {
      id: pending.id,
      status: 'cleared',
      bankDate: '2026-09-29',
      rawDescription: 'V1111 26/09 KMART 9999 SAMPLEVILLE 70000009001',
      cardSuffix: '1111',
    })
    await pendingRow.refresh()
    assert.equal(pendingRow.resolution, 'superseded')
    const postedRow = await ImportRow.findOrFail(posted.id)
    assert.equal(postedRow.transactionId, pending.id)
  })

  test('test_pending_import_missing_from_a_later_export_is_flagged_for_review', async ({
    client,
    assert,
  }) => {
    const home = await nabHousehold()
    const [pendingLine] = fixtureLines('pending-then-posted.csv')
    const first = await uploadCsv(client, home.owner, nabCsv([pendingLine]))
    await client.post(`/api/v1/imports/${first.body().data[0].id}/confirm`).actingAs(home.owner)
    const pending = await Transaction.query().where('account_id', home.everyday.id).firstOrFail()
    assert.isFalse(pending.needsReview)

    // The hold vanished: the next export covers its date without it or a posted copy.
    const later = nabCsv([
      nabLine({
        date: '28 Sept 26',
        amount: '-3.00',
        details: 'V1111 27/09 CORNER BAKERY SAMPLEVILLE 70000000940',
        balance: '497.00',
        category: 'Restaurants & takeaway',
      }),
      nabLine({
        date: '25 Sept 26',
        amount: '-1.00',
        details: 'V1111 24/09 CORNER BAKERY SAMPLEVILLE 70000000941',
        balance: '500.00',
        category: 'Restaurants & takeaway',
      }),
    ])
    await uploadCsv(client, home.owner, later)

    await pending.refresh()
    assert.isTrue(pending.needsReview, 'surfaced for review: it may never post')
    assert.equal(pending.status, 'pending')
  })

  test('test_hand_entry_matched_while_pending_is_upgraded_by_the_posted_copy', async ({
    client,
    assert,
  }) => {
    const home = await nabHousehold()
    const [pendingLine, postedLine] = fixtureLines('pending-then-posted.csv')
    const manual = await client
      .post('/api/v1/transactions')
      .json({
        accountId: home.everyday.id,
        kind: 'expense',
        date: '2026-09-26',
        amountCents: 900,
        payee: 'Kmart',
      })
      .actingAs(home.owner)
    const manualId = manual.body().data.id

    const first = await uploadCsv(client, home.owner, nabCsv([pendingLine]))
    const firstConfirm = await client
      .post(`/api/v1/imports/${first.body().data[0].id}/confirm`)
      .actingAs(home.owner)
    assert.equal(firstConfirm.body().data.matched, 1)
    const whilePending = await Transaction.findOrFail(manualId)
    assert.equal(whilePending.status, 'pending', 'the ledger mirrors the bank: still pending')

    const second = await uploadCsv(client, home.owner, nabCsv([postedLine]))
    const detail = await client
      .get(`/api/v1/imports/${second.body().data[0].id}`)
      .actingAs(home.owner)
    const [posted] = detail.body().data.rows
    assert.equal(posted.resolution, 'auto_matched')
    assert.include(posted.match, { transactionId: manualId, upgradesPending: true })

    const confirm = await client
      .post(`/api/v1/imports/${second.body().data[0].id}/confirm`)
      .actingAs(home.owner)

    confirm.assertStatus(200)
    assert.isTrue(confirm.body().data.reconciliation.balanced)
    const ledger = await Transaction.query().where('account_id', home.everyday.id)
    assert.lengthOf(ledger, 1, 'still the one hand entry')
    assert.include(ledger[0].serialize(), { id: manualId, status: 'cleared', source: 'manual' })
    const rows = await ImportRow.query().where('household_id', home.household.id).orderBy('id')
    assert.deepEqual(
      rows.map((row) => row.resolution),
      ['superseded', 'auto_matched']
    )
  })

  test('test_opening_balance_counts_a_match_dated_before_the_oldest_row', async ({
    client,
    assert,
  }) => {
    const home = await nabHousehold()
    const manual = await client
      .post('/api/v1/transactions')
      .json({
        accountId: home.everyday.id,
        kind: 'expense',
        date: '2026-09-27',
        amountCents: 1_200,
        payee: 'Corner Bakery',
      })
      .actingAs(home.owner)
    const csv = nabCsv([
      nabLine({
        date: '30 Sept 26',
        amount: '-10.00',
        details: 'V1111 30/09 FRESHCO MARKET NORTHVALE 70000000920',
        balance: '978.00',
        category: 'Groceries',
        merchant: 'FreshCo Market',
      }),
      nabLine({
        date: '29 Sept 26',
        amount: '-12.00',
        details: 'V1111 29/09 CORNER BAKERY SAMPLEVILLE 70000000921',
        balance: '988.00',
        category: 'Restaurants & takeaway',
        merchant: 'Corner Bakery',
      }),
    ])
    const upload = await uploadCsv(client, home.owner, csv)
    const batch = upload.body().data[0]
    assert.equal(batch.counts.autoMatched, 1)
    assert.isTrue(batch.reconciliation.balanced, 'the staging projection already balances')

    const confirm = await client.post(`/api/v1/imports/${batch.id}/confirm`).actingAs(home.owner)

    assert.isTrue(confirm.body().data.reconciliation.balanced)
    const everyday = await Account.findOrFail(home.everyday.id)
    assert.equal(everyday.openingBalanceDate, '2026-09-26')
    const balances = await client.get('/api/v1/reports/balances').actingAs(home.owner)
    const row = balances
      .body()
      .data.accounts.find((account: any) => account.accountId === home.everyday.id)
    assert.equal(row.availableBalanceCents, 97_800)
    const matched = await Transaction.findOrFail(manual.body().data.id)
    assert.equal(matched.bankDate, '2026-09-29')
  })

  test('test_zero_amount_rows_can_only_be_ignored', async ({ client, assert }) => {
    const home = await nabHousehold()
    const upload = await uploadCsv(client, home.owner, nabFixture('sample.csv'))
    const batch = upload.body().data[0]
    const detail = await client.get(`/api/v1/imports/${batch.id}`).actingAs(home.owner)
    const [zero] = rowsStartingWith(detail.body().data.rows, 'POS 27/09 TRANSLINK')
    assert.equal(zero.resolution, 'ignored')

    for (const body of [
      { resolution: 'new' },
      { resolution: 'transfer_leg', transferAccountId: home.savings.id },
    ]) {
      const response = await client
        .patch(`/api/v1/imports/${batch.id}/rows/${zero.id}`)
        .json(body)
        .actingAs(home.owner)
      response.assertStatus(422)
      response.assertBodyContains({ errors: [{ field: 'resolution', rule: 'zeroAmount' }] })
    }
    const confirm = await client
      .post(`/api/v1/imports/${batch.id}/confirm`)
      .json({ decisions: [{ rowId: zero.id, resolution: 'new' }] })
      .actingAs(home.owner)
    confirm.assertStatus(422)
    assert.equal(await countOf(Transaction.query().where('amount_cents', 0)), 0)
  })

  test('test_match_decisions_need_the_same_amount_and_a_free_transaction', async ({
    client,
    assert,
  }) => {
    const home = await nabHousehold()
    const other = await nabHousehold()
    const entry = (amountCents: number, date: string) =>
      TransactionFactory.merge({
        householdId: home.household.id,
        accountId: home.everyday.id,
        amountCents,
        date,
        kind: amountCents < 0 ? 'expense' : 'income',
      }).create()
    const otherAmount = await entry(-999, '2026-08-01')
    const deli = await entry(-2_910, '2026-08-01')
    const alreadyLinked = await entry(-2_910, '2026-07-01')
    const cash = await entry(12_000, '2025-12-01')
    const cashToo = await entry(12_000, '2025-12-02')
    const foreign = await TransactionFactory.merge({
      householdId: other.household.id,
      accountId: other.everyday.id,
      amountCents: -2_910,
    }).create()
    // `alreadyLinked` is the bank copy of an earlier export.
    const earlier = await ImportBatch.create({
      householdId: home.household.id,
      accountId: home.everyday.id,
      source: 'nab_csv',
      status: 'completed',
      fileHash: 'e'.repeat(64),
    })
    await ImportRow.create({
      importBatchId: earlier.id,
      householdId: home.household.id,
      accountId: home.everyday.id,
      rowIndex: 0,
      externalHash: 'f'.repeat(64),
      raw: {},
      bankDate: '2026-07-01',
      date: '2026-07-01',
      amountCents: -2_910,
      descriptionRaw: 'EARLIER',
      descriptionNormalized: 'EARLIER',
      resolution: 'new',
      reasons: [],
      transactionId: alreadyLinked.id,
    })

    const upload = await uploadCsv(client, home.owner, nabFixture('sample.csv'))
    const batch = upload.body().data[0]
    const detail = await client.get(`/api/v1/imports/${batch.id}`).actingAs(home.owner)
    const [riverside] = rowsStartingWith(detail.body().data.rows, 'V1111 29/08 RIVERSIDE')
    const [cashOne, cashTwo] = rowsStartingWith(detail.body().data.rows, 'CASH')
    const decide = (rowId: number, body: Record<string, unknown>) =>
      client.patch(`/api/v1/imports/${batch.id}/rows/${rowId}`).json(body).actingAs(home.owner)
    const rejects = async (
      rowId: number,
      body: Record<string, unknown>,
      field: string,
      rule: string
    ) => {
      const response = await decide(rowId, body)
      response.assertStatus(422)
      response.assertBodyContains({ errors: [{ field, rule }] })
    }

    await rejects(
      riverside.id,
      { resolution: 'auto_matched', matchTransactionId: otherAmount.id },
      'matchTransactionId',
      'amountMismatch'
    )
    await rejects(
      riverside.id,
      { resolution: 'auto_matched', matchTransactionId: alreadyLinked.id },
      'matchTransactionId',
      'claimed'
    )
    await rejects(
      riverside.id,
      { resolution: 'auto_matched', matchTransactionId: foreign.id },
      'matchTransactionId',
      'database.exists'
    )
    await rejects(
      riverside.id,
      { resolution: 'transfer_leg', transferAccountId: other.savings.id },
      'transferAccountId',
      'database.exists'
    )
    await rejects(riverside.id, { paidByUserId: other.owner.id }, 'paidByUserId', 'database.exists')
    const linkedDeli = await decide(riverside.id, {
      resolution: 'auto_matched',
      matchTransactionId: deli.id,
    })
    linkedDeli.assertStatus(200)

    // One bank row per transaction: a second row cannot claim it...
    const linkedCash = await decide(cashOne.id, {
      resolution: 'auto_matched',
      matchTransactionId: cash.id,
    })
    linkedCash.assertStatus(200)
    await rejects(
      cashTwo.id,
      { resolution: 'auto_matched', matchTransactionId: cash.id },
      'matchTransactionId',
      'claimed'
    )
    // ...not even within one confirm payload.
    const payload = await client
      .post(`/api/v1/imports/${batch.id}/confirm`)
      .json({
        decisions: [
          { rowId: cashOne.id, resolution: 'auto_matched', matchTransactionId: cashToo.id },
          { rowId: cashTwo.id, resolution: 'auto_matched', matchTransactionId: cashToo.id },
        ],
      })
      .actingAs(home.owner)
    payload.assertStatus(422)
    payload.assertBodyContains({ errors: [{ field: 'matchTransactionId', rule: 'claimed' }] })
    assert.equal(
      await countOf(
        ImportRow.query().whereNotNull('confirmed_at').where('import_batch_id', batch.id)
      ),
      0
    )
  })

  test('test_second_confirm_of_a_batch_is_a_conflict', async ({ client }) => {
    const home = await nabHousehold()
    const upload = await uploadCsv(client, home.owner, nabFixture('sample.csv'))
    const batchId = upload.body().data[0].id
    const first = await client.post(`/api/v1/imports/${batchId}/confirm`).actingAs(home.owner)
    first.assertStatus(200)

    const second = await client.post(`/api/v1/imports/${batchId}/confirm`).actingAs(home.member)

    second.assertStatus(409)
    second.assertBodyContains({ code: 'E_IMPORT_BATCH_CLOSED' })
  })

  test('test_deleted_imported_transaction_is_not_resurrected_by_reimport', async ({
    client,
    assert,
  }) => {
    const home = await nabHousehold()
    const first = await uploadCsv(client, home.owner, nabFixture('sample.csv'))
    await client.post(`/api/v1/imports/${first.body().data[0].id}/confirm`).actingAs(home.owner)
    const bakery = await Transaction.query()
      .where('account_id', home.everyday.id)
      .where('raw_description', 'like', 'EFTPOS 23/08%')
      .firstOrFail()

    const destroyed = await client.delete(`/api/v1/transactions/${bakery.id}`).actingAs(home.owner)

    destroyed.assertStatus(204)
    const row = await ImportRow.query()
      .where('household_id', home.household.id)
      .where('date', '2026-08-23')
      .firstOrFail()
    assert.equal(row.resolution, 'ignored')
    assert.isNull(row.transactionId)
    const again = await uploadCsv(client, home.owner, nabFixture('sample.csv'))
    assert.include(again.body().data[0].counts, { duplicate: 35, new: 0 })
  })

  test('test_decisions_are_validated_and_closed_batches_are_read_only', async ({
    client,
    assert,
  }) => {
    const home = await nabHousehold()
    const other = await nabHousehold()
    const foreignCategory = await categoryBySlug(other.household.id, 'groceries')
    const upload = await uploadCsv(client, home.owner, nabFixture('sample.csv'))
    const batch = upload.body().data[0]
    const detail = await client.get(`/api/v1/imports/${batch.id}`).actingAs(home.owner)
    const [row] = rowsStartingWith(detail.body().data.rows, 'V1111 29/08 RIVERSIDE')

    const foreign = await client
      .patch(`/api/v1/imports/${batch.id}/rows/${row.id}`)
      .json({ categoryId: foreignCategory.id })
      .actingAs(home.owner)
    foreign.assertStatus(422)
    foreign.assertBodyContains({ errors: [{ field: 'categoryId', rule: 'database.exists' }] })

    const noTarget = await client
      .patch(`/api/v1/imports/${batch.id}/rows/${row.id}`)
      .json({ resolution: 'transfer_leg' })
      .actingAs(home.owner)
    noTarget.assertStatus(422)
    noTarget.assertBodyContains({ errors: [{ field: 'transferAccountId', rule: 'required' }] })

    const sameAccount = await client
      .patch(`/api/v1/imports/${batch.id}/rows/${row.id}`)
      .json({ resolution: 'transfer_leg', transferAccountId: home.everyday.id })
      .actingAs(home.owner)
    sameAccount.assertStatus(422)

    const badSplit = await client
      .patch(`/api/v1/imports/${batch.id}/rows/${row.id}`)
      .json({
        splits: [
          { categoryId: foreignCategory.id, amountCents: 100 },
          { categoryId: foreignCategory.id, amountCents: 100 },
        ],
      })
      .actingAs(home.owner)
    badSplit.assertStatus(422)

    const groceries = await categoryBySlug(home.household.id, 'groceries')
    const restaurants = await categoryBySlug(home.household.id, 'restaurants-takeaway')
    const split = await client
      .patch(`/api/v1/imports/${batch.id}/rows/${row.id}`)
      .json({
        splits: [
          { categoryId: groceries.id, amountCents: 2_000 },
          { categoryId: restaurants.id, amountCents: 910 },
        ],
      })
      .actingAs(home.owner)
    split.assertStatus(200)

    await client.post(`/api/v1/imports/${batch.id}/confirm`).actingAs(home.owner)
    const created = await Transaction.query()
      .where('account_id', home.everyday.id)
      .where('raw_description', 'V1111 29/08 RIVERSIDE DELI EASTBROOK 70000000501')
      .preload('splits')
      .firstOrFail()
    assert.isTrue(created.isSplit)
    assert.sameMembers(
      created.splits.map((line) => line.amountCents),
      [-2_000, -910]
    )

    const late = await client
      .patch(`/api/v1/imports/${batch.id}/rows/${row.id}`)
      .json({ resolution: 'ignored' })
      .actingAs(home.owner)
    late.assertStatus(409)
    late.assertBodyContains({ code: 'E_IMPORT_BATCH_CLOSED' })
  })
})
