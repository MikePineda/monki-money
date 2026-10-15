import { test } from '@japa/runner'
import Account from '#models/account'
import Category from '#models/category'
import ImportRow from '#models/import_row'
import ImportBatch from '#models/import_batch'
import Transaction from '#models/transaction'
import MerchantRule from '#models/merchant_rule'
import drive from '@adonisjs/drive/services/main'
import { categoryBySlug, freezeClock } from '#tests/helpers/ledger'
import { NAB_HEADER, nabCsv, nabFixture } from '#tests/helpers/importing'
import { countOf, nabHousehold, nabLine, rowsStartingWith, uploadCsv } from '#tests/helpers/imports'

const TODAY = '2026-10-15T09:00:00+10:00'

/** Data lines of a fixture (header dropped), to build partial uploads. */
function fixtureLines(name: string) {
  return nabFixture(name)
    .toString('utf8')
    .split(/\r?\n/)
    .filter((line) => line !== '' && line !== NAB_HEADER)
}

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
    assert.equal((await ImportBatch.findOrFail(batch.id)).status, 'completed')

    const ledger = await Transaction.query().where('account_id', home.everyday.id)
    assert.lengthOf(ledger, 28 + 4)
    const barber = ledger.find((row) => row.rawDescription?.startsWith('V1111 02/09'))!
    assert.include(barber.serialize(), {
      categoryId: personalCare.id,
      payee: 'Barber',
      kind: 'expense',
      amountCents: -410,
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
    assert.equal((await ImportBatch.findOrFail(batch.id)).status, 'staged')
    const rows = await ImportRow.query().where('import_batch_id', batch.id)
    assert.isTrue(rows.every((row) => row.confirmedAt === null && row.transactionId === null))
    assert.equal(
      await countOf(MerchantRule.query()
        .where('household_id', home.household.id)
        .where('origin', 'learned')
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
      expectedBalanceCents: 723_731,
      computedBalanceCents: 723_731,
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
      computedBalanceCents: 722_731,
      differenceCents: -22_731,
      balanced: false,
      missingBefore: '2026-10-10',
    })
  })

  test('test_opening_balance_is_derived_from_first_import', async ({ client, assert }) => {
    const home = await nabHousehold()
    const upload = await uploadCsv(client, home.owner, nabFixture('sample.csv'))
    const batch = upload.body().data[0]
    assert.equal(batch.reconciliation.openingBalanceCents, 150_000)

    await client.post(`/api/v1/imports/${batch.id}/confirm`).actingAs(home.owner)

    const everyday = await Account.findOrFail(home.everyday.id)
    assert.equal(everyday.openingBalanceCents, 150_000)
    assert.equal(everyday.openingBalanceDate, '2025-12-22')
    const balances = await client.get('/api/v1/reports/balances').actingAs(home.owner)
    const row = balances
      .body()
      .data.accounts.find((account: any) => account.accountId === home.everyday.id)
    assert.equal(row.availableBalanceCents, 723_731)

    // Later imports never touch it again.
    const later = nabCsv([
      nabLine({
        date: '10 Oct 26',
        amount: '-10.00',
        details: 'V1111 09/10 CORNER BAKERY SAMPLEVILLE 70000000903',
        balance: '7227.31',
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
    assert.equal(everyday.openingBalanceCents, 150_000)
  })

  test('test_pending_row_is_upgraded_on_next_import', async ({ client, assert }) => {
    const home = await nabHousehold()
    const [pendingLine, postedLine] = fixtureLines('pending-then-posted.csv')

    const first = await uploadCsv(client, home.owner, nabCsv([pendingLine]))
    const firstBatch = first.body().data[0]
    await client.post(`/api/v1/imports/${firstBatch.id}/confirm`).actingAs(home.owner)
    const pending = await Transaction.query().where('account_id', home.everyday.id).firstOrFail()
    assert.equal(pending.status, 'pending')
    const pendingRow = await ImportRow.query().where('import_batch_id', firstBatch.id).firstOrFail()

    const second = await uploadCsv(client, home.owner, nabCsv([postedLine]))
    const secondBatch = second.body().data[0]
    const detail = await client.get(`/api/v1/imports/${secondBatch.id}`).actingAs(home.owner)
    const [posted] = detail.body().data.rows
    assert.equal(posted.resolution, 'auto_matched')
    assert.include(posted.match, { transactionId: pending.id, upgradesPending: true })

    const confirm = await client
      .post(`/api/v1/imports/${secondBatch.id}/confirm`)
      .actingAs(home.owner)

    confirm.assertStatus(200)
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
    assert.equal((await ImportRow.findOrFail(posted.id)).transactionId, pending.id)
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
    const row = await ImportRow.query().where('household_id', home.household.id).where('date', '2026-08-23').firstOrFail()
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
          { categoryId: restaurants.id, amountCents: 1_254 },
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
      [-2_000, -1_254]
    )

    const late = await client
      .patch(`/api/v1/imports/${batch.id}/rows/${row.id}`)
      .json({ resolution: 'ignored' })
      .actingAs(home.owner)
    late.assertStatus(409)
    late.assertBodyContains({ code: 'E_IMPORT_BATCH_CLOSED' })
  })
})
