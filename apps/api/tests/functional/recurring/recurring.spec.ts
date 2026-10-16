import { test } from '@japa/runner'
import type User from '#models/user'
import ImportRow from '#models/import_row'
import ImportBatch from '#models/import_batch'
import Transaction from '#models/transaction'
import RecurringItem from '#models/recurring_item'
import app from '@adonisjs/core/services/app'
import RecurringDetector from '#services/recurring/recurring_detector'
import { addDays } from '#domain/importing/iso_days'
import drive from '@adonisjs/drive/services/main'
import { nabCsv } from '#tests/helpers/importing'
import { categoryBySlug, freezeClock } from '#tests/helpers/ledger'
import { createHousehold, type TestHousehold } from '#tests/helpers/household'
import { TransactionFactory } from '#database/factories/transaction_factory'
import { nabHousehold, nabLine, uploadCsv } from '#tests/helpers/imports'

/** Friday 2026-10-16, mid-morning in Brisbane (the households' time zone). */
const NOW = '2026-10-16T09:00:00+10:00'

const ITEM_FIELDS = [
  'id',
  'payee',
  'merchantKey',
  'cadence',
  'amountCents',
  'amountTolerancePct',
  'categoryId',
  'accountId',
  'paidByUserId',
  'lastPaidDate',
  'nextExpectedDate',
  'status',
  'pausedByDetection',
  'source',
  'occurrences',
  'createdAt',
  'updatedAt',
]

/** `count` payments of `amountCents` to `payee`, `everyDays` apart, the last on `last`. */
async function payments(
  home: TestHousehold,
  options: {
    payee: string
    last: string
    everyDays: number
    count: number
    amountCents?: number
    state?: 'income' | 'transfer' | 'private'
    paidByUserId?: number | null
    categoryId?: number | null
  }
) {
  const rows = []
  for (let index = 0; index < options.count; index++) {
    const factory = TransactionFactory.merge({
      householdId: home.household.id,
      accountId: home.accounts[0].id,
      payee: options.payee,
      date: addDays(options.last, -options.everyDays * (options.count - 1 - index)),
      amountCents: -(options.amountCents ?? 50_000),
      paidByUserId: options.paidByUserId ?? null,
      createdByUserId: home.owner.id,
      categoryId: options.categoryId ?? null,
    })
    rows.push(await (options.state ? factory.apply(options.state) : factory).create())
  }
  return rows
}

function detect(client: any, user: User) {
  return client.post('/api/v1/recurring/detect').actingAs(user)
}

/**
 * Weekly rent paid by bank transfer and imported: the bank row's merchant
 * key is the agency's, while the person named the payee "Rent".
 */
async function importedRent(home: TestHousehold, dates: string[]) {
  const batch = await ImportBatch.create({
    householdId: home.household.id,
    accountId: home.accounts[0].id,
    source: 'nab_csv',
    status: 'completed',
    fileHash: 'c'.repeat(64),
  })
  for (const [index, date] of dates.entries()) {
    const transaction = await TransactionFactory.merge({
      householdId: home.household.id,
      accountId: home.accounts[0].id,
      payee: 'Rent',
      date,
      amountCents: -50_000,
      source: 'import',
      rawDescription: `ONLINE A123456789${index} Rent Harbour Lettings`,
      createdByUserId: home.owner.id,
    }).create()
    await ImportRow.create({
      importBatchId: batch.id,
      householdId: home.household.id,
      accountId: home.accounts[0].id,
      rowIndex: index,
      externalHash: String(index).repeat(64).slice(0, 64),
      raw: {},
      bankDate: date,
      date,
      amountCents: -50_000,
      descriptionRaw: `ONLINE A123456789${index} Rent Harbour Lettings`,
      descriptionNormalized: 'Rent Harbour Lettings',
      merchantKey: 'rent harbour lettings',
      merchantFullKey: 'rent harbour lettings',
      resolution: 'new',
      reasons: [],
      transactionId: transaction.id,
    })
  }
}

test.group('Recurring payments', (group) => {
  group.each.setup(() => freezeClock(NOW))

  test('test_detect_finds_weekly_rent_and_running_it_again_changes_nothing', async ({
    client,
    assert,
  }) => {
    const home = await createHousehold({ taxonomy: true, accounts: [{ name: 'Everyday' }] })
    const housing = await categoryBySlug(home.household.id, 'rent')
    await payments(home, {
      payee: 'Harbour Lettings',
      last: '2026-10-13',
      everyDays: 7,
      count: 4,
      categoryId: housing.id,
    })
    // Groceries on irregular days are not a bill.
    for (const date of ['2026-09-02', '2026-09-05', '2026-09-22', '2026-10-01']) {
      await payments(home, { payee: 'Corner Grocer', last: date, everyDays: 1, count: 1 })
    }

    const first = await detect(client, home.owner)

    first.assertStatus(200)
    assert.deepEqual(first.body().data, { created: 1, updated: 0 })
    const list = await client.get('/api/v1/recurring').actingAs(home.owner)
    list.assertStatus(200)
    const [item] = list.body().data
    assert.sameMembers(Object.keys(item), ITEM_FIELDS)
    assert.include(item, {
      payee: 'Harbour Lettings',
      merchantKey: 'harbour lettings',
      cadence: 'weekly',
      amountCents: 50_000,
      amountTolerancePct: 15,
      categoryId: housing.id,
      accountId: home.accounts[0].id,
      paidByUserId: null,
      lastPaidDate: '2026-10-13',
      nextExpectedDate: '2026-10-20',
      status: 'active',
      source: 'detected',
      occurrences: 4,
    })

    const again = await detect(client, home.owner)
    assert.deepEqual(again.body().data, { created: 0, updated: 0 })
    assert.lengthOf(await RecurringItem.query().where('household_id', home.household.id), 1)
  })

  test('test_items_are_listed_active_first_then_by_next_date', async ({ client, assert }) => {
    const home = await createHousehold()
    const item = (merchantKey: string, status: RecurringItem['status'], next: string) =>
      RecurringItem.create({
        householdId: home.household.id,
        merchantKey,
        payee: merchantKey,
        cadence: 'monthly',
        amountCents: 1_000,
        nextExpectedDate: next,
        status,
      })
    await item('dismissed one', 'dismissed', '2026-10-17')
    await item('paused one', 'paused', '2026-10-18')
    await item('later', 'active', '2026-11-01')
    await item('sooner', 'active', '2026-10-20')

    const response = await client.get('/api/v1/recurring').actingAs(home.owner)

    assert.deepEqual(
      response.body().data.map((row: any) => row.merchantKey),
      ['sooner', 'later', 'paused one', 'dismissed one']
    )
  })

  test('test_a_person_adds_pauses_resumes_and_deletes_an_item', async ({ client, assert }) => {
    const home = await createHousehold({ users: 2, taxonomy: true, accounts: [{}] })
    const gym = await categoryBySlug(home.household.id, 'gym')

    const created = await client
      .post('/api/v1/recurring')
      .json({
        payee: 'Pulse Gym (City)',
        cadence: 'fortnightly',
        amountCents: 2_990,
        nextExpectedDate: '2026-10-23',
        categoryId: gym.id,
        accountId: home.accounts[0].id,
        paidByUserId: home.member.id,
      })
      .actingAs(home.owner)

    created.assertStatus(201)
    const item = created.body().data
    assert.include(item, {
      payee: 'Pulse Gym (City)',
      merchantKey: 'pulse gym',
      cadence: 'fortnightly',
      amountCents: 2_990,
      amountTolerancePct: 15,
      categoryId: gym.id,
      accountId: home.accounts[0].id,
      paidByUserId: home.member.id,
      lastPaidDate: null,
      nextExpectedDate: '2026-10-23',
      status: 'active',
      source: 'manual',
      occurrences: 0,
    })

    const paused = await client
      .patch(`/api/v1/recurring/${item.id}`)
      .json({ status: 'paused', amountCents: 3_190 })
      .actingAs(home.member)
    paused.assertStatus(200)
    assert.include(paused.body().data, { status: 'paused', amountCents: 3_190 })

    const resumed = await client
      .patch(`/api/v1/recurring/${item.id}`)
      .json({ status: 'active', cadence: 'monthly', categoryId: null, paidByUserId: null })
      .actingAs(home.owner)
    assert.include(resumed.body().data, {
      status: 'active',
      cadence: 'monthly',
      categoryId: null,
      paidByUserId: null,
    })

    const deleted = await client.delete(`/api/v1/recurring/${item.id}`).actingAs(home.owner)
    deleted.assertStatus(204)
    assert.isNull(await RecurringItem.find(item.id))
  })

  test('test_detection_keeps_what_a_person_edited', async ({ client, assert, cleanup }) => {
    const home = await createHousehold({ taxonomy: true, accounts: [{}] })
    const housing = await categoryBySlug(home.household.id, 'rent')
    await payments(home, { payee: 'Harbour Lettings', last: '2026-10-13', everyDays: 7, count: 4 })
    await detect(client, home.owner)
    const item = await RecurringItem.query().where('household_id', home.household.id).firstOrFail()

    const edited = await client
      .patch(`/api/v1/recurring/${item.id}`)
      .json({ payee: 'Rent', amountCents: 55_000, categoryId: housing.id })
      .actingAs(home.owner)
    edited.assertStatus(200)

    // A week later the next payment arrives.
    await payments(home, { payee: 'Harbour Lettings', last: '2026-10-20', everyDays: 7, count: 1 })
    cleanup(freezeClock('2026-10-21T09:00:00+10:00'))
    const again = await detect(client, home.owner)

    assert.deepEqual(again.body().data, { created: 0, updated: 1 })
    await item.refresh()
    assert.include(item.serialize(), {
      payee: 'Rent',
      amountCents: 55_000,
      categoryId: housing.id,
      occurrences: 5,
      lastPaidDate: '2026-10-20',
      nextExpectedDate: '2026-10-27',
    })
  })

  test('test_a_dismissed_item_never_comes_back_but_a_deleted_one_does', async ({
    client,
    assert,
  }) => {
    const home = await createHousehold({ accounts: [{}] })
    await payments(home, { payee: 'Harbour Lettings', last: '2026-10-13', everyDays: 7, count: 4 })
    await detect(client, home.owner)
    const item = await RecurringItem.query().where('household_id', home.household.id).firstOrFail()

    await client
      .patch(`/api/v1/recurring/${item.id}`)
      .json({ status: 'dismissed' })
      .actingAs(home.owner)
    const again = await detect(client, home.owner)

    assert.deepEqual(again.body().data, { created: 0, updated: 0 })
    await item.refresh()
    assert.equal(item.status, 'dismissed')

    await client.delete(`/api/v1/recurring/${item.id}`).actingAs(home.owner)
    const afterDelete = await detect(client, home.owner)
    assert.deepEqual(afterDelete.body().data, { created: 1, updated: 0 })
  })

  test('test_transfers_income_and_private_purchases_are_never_recurring', async ({
    client,
    assert,
  }) => {
    const home = await createHousehold({ users: 2, accounts: [{}, {}] })
    const weekly = { last: '2026-10-13', everyDays: 7, count: 4 }
    await payments(home, { ...weekly, payee: 'Savings sweep', state: 'transfer' })
    await payments(home, { ...weekly, payee: 'Weekly pay', state: 'income' })
    await payments(home, {
      ...weekly,
      payee: 'Surprise gift club',
      state: 'private',
      paidByUserId: home.owner.id,
    })

    const response = await detect(client, home.member)

    assert.deepEqual(response.body().data, { created: 0, updated: 0 })
  })

  test('test_a_manual_item_is_validated', async ({ client }) => {
    const home = await createHousehold()

    const empty = await client.post('/api/v1/recurring').json({}).actingAs(home.owner)
    empty.assertStatus(422)
    empty.assertBodyContains({
      errors: [
        { field: 'payee', rule: 'required' },
        { field: 'cadence', rule: 'required' },
        { field: 'amountCents', rule: 'required' },
        { field: 'nextExpectedDate', rule: 'required' },
      ],
    })

    const body = { cadence: 'monthly', amountCents: 1_000, nextExpectedDate: '2026-11-01' }
    const noLetters = await client
      .post('/api/v1/recurring')
      .json({ ...body, payee: '123 456' })
      .actingAs(home.owner)
    noLetters.assertStatus(422)
    noLetters.assertBodyContains({ errors: [{ field: 'payee', rule: 'merchantKey' }] })

    await client
      .post('/api/v1/recurring')
      .json({ ...body, payee: 'Telco One' })
      .actingAs(home.owner)
      .then((response: any) => response.assertStatus(201))
    const taken = await client
      .post('/api/v1/recurring')
      .json({ ...body, payee: 'TELCO ONE (prepaid)' })
      .actingAs(home.owner)
    taken.assertStatus(422)
    taken.assertBodyContains({ errors: [{ field: 'payee', rule: 'taken' }] })

    const tolerance = await client
      .post('/api/v1/recurring')
      .json({ ...body, payee: 'Pulse Gym', amountTolerancePct: 101, cadence: 'daily' })
      .actingAs(home.owner)
    tolerance.assertStatus(422)
    tolerance.assertBodyContains({
      errors: [
        { field: 'cadence', rule: 'enum' },
        { field: 'amountTolerancePct', rule: 'max' },
      ],
    })
  })

  test('test_an_item_typed_by_hand_matches_the_imported_rows_and_is_not_detected_twice', async ({
    client,
    assert,
  }) => {
    const home = await createHousehold({ accounts: [{}] })
    await importedRent(home, ['2026-09-22', '2026-09-29', '2026-10-06', '2026-10-13'])
    const typed = await client
      .post('/api/v1/recurring')
      .json({
        payee: 'Rent',
        cadence: 'weekly',
        amountCents: 50_000,
        nextExpectedDate: '2026-09-22',
      })
      .actingAs(home.owner)
    typed.assertStatus(201)
    assert.equal(typed.body().data.merchantKey, 'rent')

    // The imported transfers the person named "Rent" pay it.
    const month = await client.get('/api/v1/reports/month?month=2026-10').actingAs(home.owner)
    assert.deepEqual(
      month.body().data.committed.items.map((item: any) => [item.dueDate, item.paid]),
      [
        ['2026-10-06', true],
        ['2026-10-13', true],
        ['2026-10-20', false],
        ['2026-10-27', false],
      ]
    )

    // Detection finds the pattern under the bank's key and lands it on the typed item.
    const detected = await detect(client, home.owner)
    assert.deepEqual(detected.body().data, { created: 0, updated: 1 })
    const items = await RecurringItem.query().where('household_id', home.household.id)
    assert.lengthOf(items, 1)
    assert.include(items[0].serialize(), {
      merchantKey: 'rent',
      source: 'manual',
      occurrences: 4,
      lastPaidDate: '2026-10-13',
    })

    // Tracked under its payee key: the imported rows are not offered as a new merchant.
    const offered = await client.get('/api/v1/recurring/merchants').actingAs(home.owner)
    assert.deepEqual(offered.body().data, [])
  })

  test('test_adding_an_item_offers_the_merchants_paid_lately', async ({ client, assert }) => {
    const home = await createHousehold({ users: 2, accounts: [{}] })
    await importedRent(home, ['2026-09-29', '2026-10-06', '2026-10-13'])
    await payments(home, {
      payee: 'Corner Grocer',
      last: '2026-10-10',
      everyDays: 7,
      count: 2,
      amountCents: 8_000,
    })
    await payments(home, {
      payee: 'Surprise Gift Shop',
      last: '2026-10-11',
      everyDays: 1,
      count: 1,
      state: 'private',
      paidByUserId: home.owner.id,
    })

    const offered = await client.get('/api/v1/recurring/merchants').actingAs(home.member)

    offered.assertStatus(200)
    assert.deepEqual(offered.body().data, [
      {
        merchantKey: 'rent harbour lettings',
        payee: 'Rent',
        amountCents: 50_000,
        lastPaidDate: '2026-10-13',
        count: 3,
      },
      {
        merchantKey: 'corner grocer',
        payee: 'Corner Grocer',
        amountCents: 8_000,
        lastPaidDate: '2026-10-10',
        count: 2,
      },
    ])

    // Picking one keys the item like the bank, so it is not offered again.
    const created = await client
      .post('/api/v1/recurring')
      .json({
        payee: 'Rent',
        merchantKey: 'rent harbour lettings',
        cadence: 'weekly',
        amountCents: 50_000,
        nextExpectedDate: '2026-10-20',
      })
      .actingAs(home.member)
    created.assertStatus(201)
    assert.equal(created.body().data.merchantKey, 'rent harbour lettings')
    const after = await client.get('/api/v1/recurring/merchants').actingAs(home.member)
    assert.deepEqual(
      after.body().data.map((merchant: any) => merchant.merchantKey),
      ['corner grocer']
    )

    const invalid = await client
      .post('/api/v1/recurring')
      .json({
        payee: 'Rent',
        merchantKey: 'Rent Harbour 123',
        cadence: 'weekly',
        amountCents: 50_000,
        nextExpectedDate: '2026-10-20',
      })
      .actingAs(home.member)
    invalid.assertStatus(422)
    invalid.assertBodyContains({ errors: [{ field: 'merchantKey', rule: 'regex' }] })
  })

  test('test_a_status_a_person_chose_is_kept_by_detection', async ({ client, assert }) => {
    const home = await createHousehold({ accounts: [{}] })
    await payments(home, { payee: 'Harbour Lettings', last: '2026-10-13', everyDays: 7, count: 4 })
    await detect(client, home.owner)
    const item = await RecurringItem.query().where('household_id', home.household.id).firstOrFail()

    const paused = await client
      .patch(`/api/v1/recurring/${item.id}`)
      .json({ status: 'paused' })
      .actingAs(home.owner)
    assert.include(paused.body().data, { status: 'paused', pausedByDetection: false })
    await detect(client, home.owner)

    await item.refresh()
    assert.equal(item.status, 'paused')
    assert.include(item.editedFields, 'status')
  })

  test('test_foreign_ids_in_recurring_bodies_are_rejected_with_422', async ({ client, assert }) => {
    const victim = await createHousehold({ taxonomy: true, accounts: [{}] })
    const victimCategory = await categoryBySlug(victim.household.id, 'groceries')
    const home = await createHousehold({ accounts: [{}] })
    const body = {
      payee: 'Telco One',
      cadence: 'monthly',
      amountCents: 6_500,
      nextExpectedDate: '2026-10-28',
    }

    for (const [field, value] of [
      ['categoryId', victimCategory.id],
      ['accountId', victim.accounts[0].id],
      ['paidByUserId', victim.owner.id],
    ] as const) {
      const response = await client
        .post('/api/v1/recurring')
        .json({ ...body, [field]: value })
        .actingAs(home.owner)
      response.assertStatus(422)
      response.assertBodyContains({ errors: [{ field, rule: 'database.exists' }] })
    }

    const own = await client.post('/api/v1/recurring').json(body).actingAs(home.owner)
    const patched = await client
      .patch(`/api/v1/recurring/${own.body().data.id}`)
      .json({ categoryId: victimCategory.id })
      .actingAs(home.owner)
    patched.assertStatus(422)
    patched.assertBodyContains({ errors: [{ field: 'categoryId', rule: 'database.exists' }] })
    assert.lengthOf(await RecurringItem.query().where('household_id', victim.household.id), 0)
  })
})

test.group('Recurring payments: committed this month', (group) => {
  group.each.setup(() => freezeClock(NOW))

  test('test_month_report_says_what_is_already_paid_and_still_due', async ({ client, assert }) => {
    const home = await createHousehold({ users: 2, taxonomy: true, accounts: [{}] })
    const rent = await categoryBySlug(home.household.id, 'rent')
    const phone = await categoryBySlug(home.household.id, 'phone-internet')
    // Weekly rent, paid on 6 and 13 October; due again on 20 and 27 October.
    await payments(home, {
      payee: 'Harbour Lettings',
      last: '2026-10-13',
      everyDays: 7,
      count: 4,
      categoryId: rent.id,
    })
    await detect(client, home.owner)
    const manual = (payee: string, extra: Record<string, unknown>) =>
      client
        .post('/api/v1/recurring')
        .json({ payee, cadence: 'monthly', amountCents: 6_500, ...extra })
        .actingAs(home.owner)
    await manual('Telco One', {
      nextExpectedDate: '2026-10-28',
      categoryId: phone.id,
      paidByUserId: home.member.id,
    })
    const gym = await manual('Pulse Gym', { nextExpectedDate: '2026-10-20' })
    await client
      .patch(`/api/v1/recurring/${gym.body().data.id}`)
      .json({ status: 'paused' })
      .actingAs(home.owner)
    const club = await manual('Wine Club', { nextExpectedDate: '2026-10-25' })
    await client
      .patch(`/api/v1/recurring/${club.body().data.id}`)
      .json({ status: 'dismissed' })
      .actingAs(home.owner)
    const rentItem = await RecurringItem.findByOrFail('merchant_key', 'harbour lettings')
    const telco = await RecurringItem.findByOrFail('merchant_key', 'telco one')

    const response = await client.get('/api/v1/reports/month?month=2026-10').actingAs(home.owner)

    response.assertStatus(200)
    const rentLine = (dueDate: string, paid: boolean) => ({
      id: rentItem.id,
      payee: 'Harbour Lettings',
      amountCents: 50_000,
      dueDate,
      paid,
      overdue: false,
      categoryId: rent.id,
    })
    assert.deepEqual(response.body().data.committed, {
      paidCents: 100_000,
      upcomingCents: 106_500,
      recurringCount: 3,
      items: [
        rentLine('2026-10-06', true),
        rentLine('2026-10-13', true),
        rentLine('2026-10-20', false),
        rentLine('2026-10-27', false),
        {
          id: telco.id,
          payee: 'Telco One',
          amountCents: 6_500,
          dueDate: '2026-10-28',
          paid: false,
          overdue: false,
          categoryId: phone.id,
        },
      ],
    })

    // Only what one person pays: their items and their payments.
    const mine = await client
      .get(`/api/v1/reports/month?month=2026-10&paidByUserId=${home.member.id}`)
      .actingAs(home.owner)
    assert.deepInclude(mine.body().data.committed, {
      paidCents: 0,
      upcomingCents: 6_500,
      recurringCount: 3,
    })
  })

  test('test_a_partners_private_payment_never_shows_as_paid', async ({ client, assert }) => {
    const home = await createHousehold({ users: 2, accounts: [{}] })
    await client
      .post('/api/v1/recurring')
      .json({
        payee: 'Pulse Gym',
        cadence: 'monthly',
        amountCents: 2_990,
        nextExpectedDate: '2026-10-28',
      })
      .actingAs(home.owner)
    await payments(home, {
      payee: 'Pulse Gym',
      last: '2026-10-20',
      everyDays: 1,
      count: 1,
      amountCents: 2_990,
      state: 'private',
      paidByUserId: home.owner.id,
    })

    const partner = await client.get('/api/v1/reports/month?month=2026-10').actingAs(home.member)
    const payer = await client.get('/api/v1/reports/month?month=2026-10').actingAs(home.owner)

    assert.deepInclude(partner.body().data.committed, { paidCents: 0, upcomingCents: 2_990 })
    assert.deepInclude(payer.body().data.committed, { paidCents: 2_990, upcomingCents: 0 })
  })

  test('test_a_due_date_already_past_and_unpaid_is_overdue_and_still_due', async ({
    client,
    assert,
  }) => {
    // Mid-October, only September's rent in the ledger (the bank export comes monthly).
    const home = await createHousehold({ accounts: [{}] })
    await payments(home, { payee: 'Harbour Lettings', last: '2026-09-29', everyDays: 7, count: 4 })
    await detect(client, home.owner)

    const response = await client.get('/api/v1/reports/month?month=2026-10').actingAs(home.owner)

    const { committed } = response.body().data
    assert.equal(committed.upcomingCents, 200_000)
    assert.deepEqual(
      committed.items.map((item: any) => [item.dueDate, item.overdue]),
      [
        ['2026-10-06', true],
        ['2026-10-13', true],
        ['2026-10-20', false],
        ['2026-10-27', false],
      ]
    )
  })

  test('test_refunds_are_never_payments', async ({ client, assert }) => {
    const home = await createHousehold({ accounts: [{}] })
    // Four weekly refunds from the same merchant: money coming back, not a bill.
    await payments(home, {
      payee: 'Pulse Gym',
      last: '2026-10-13',
      everyDays: 7,
      count: 4,
      amountCents: 2_990,
      state: 'income',
    })
    const detected = await detect(client, home.owner)
    assert.deepEqual(detected.body().data, { created: 0, updated: 0 })

    await client
      .post('/api/v1/recurring')
      .json({
        payee: 'Pulse Gym',
        cadence: 'weekly',
        amountCents: 2_990,
        nextExpectedDate: '2026-10-06',
      })
      .actingAs(home.owner)
    const response = await client.get('/api/v1/reports/month?month=2026-10').actingAs(home.owner)

    assert.equal(response.body().data.committed.paidCents, 0)
    assert.isFalse(response.body().data.committed.items.some((item: any) => item.paid))
  })

  test('test_a_household_without_items_commits_nothing', async ({ client, assert }) => {
    const home = await createHousehold({ accounts: [{}] })

    const response = await client.get('/api/v1/reports/month?month=2026-10').actingAs(home.owner)

    assert.deepEqual(response.body().data.committed, {
      paidCents: 0,
      upcomingCents: 0,
      recurringCount: 0,
      items: [],
    })
  })
})

test.group('Recurring payments: after an import', (group) => {
  group.each.setup(() => {
    drive.fake()
    const restoreClock = freezeClock(NOW)
    return () => {
      drive.restore()
      restoreClock()
    }
  })

  test('test_confirming_an_import_detects_recurring_payments', async ({ client, assert }) => {
    const home = await nabHousehold()
    const weeks = ['22 Sep 26', '29 Sep 26', '06 Oct 26', '13 Oct 26']
    const csv = nabCsv(
      weeks.map((date, index) =>
        nabLine({
          date,
          amount: '-29.90',
          details: `V1111 ${date.slice(0, 2)}/${index < 2 ? '09' : '10'} PULSE GYM SAMPLEVILLE 7000000090${index}`,
          category: 'Uncategorised',
          merchant: 'Pulse Gym (Sampleville)',
        })
      )
    )
    const upload = await uploadCsv(client, home.owner, csv)
    upload.assertStatus(201)

    const confirm = await client
      .post(`/api/v1/imports/${upload.body().data[0].id}/confirm`)
      .actingAs(home.owner)

    confirm.assertStatus(200)
    const items = await RecurringItem.query().where('household_id', home.household.id)
    assert.lengthOf(items, 1)
    assert.include(items[0].serialize(), {
      merchantKey: 'pulse gym',
      cadence: 'weekly',
      amountCents: 2_990,
      occurrences: 4,
      lastPaidDate: '2026-10-13',
      nextExpectedDate: '2026-10-20',
      source: 'detected',
    })
  })

  test('test_a_detection_failure_after_confirm_leaves_the_import_confirmed', async ({
    client,
    assert,
    cleanup,
  }) => {
    class BrokenDetector extends RecurringDetector {
      override async detect(): Promise<never> {
        throw new Error('detection exploded')
      }
    }
    app.container.swap(RecurringDetector, () => new BrokenDetector({} as never, {} as never))
    cleanup(() => app.container.restore(RecurringDetector))
    const home = await nabHousehold()
    const csv = nabCsv([
      nabLine({
        date: '13 Oct 26',
        amount: '-29.90',
        details: 'V1111 13/10 PULSE GYM SAMPLEVILLE 70000000900',
        merchant: 'Pulse Gym (Sampleville)',
      }),
    ])
    const upload = await uploadCsv(client, home.owner, csv)

    const confirm = await client
      .post(`/api/v1/imports/${upload.body().data[0].id}/confirm`)
      .actingAs(home.owner)

    confirm.assertStatus(200)
    assert.include(confirm.body().data, { status: 'completed', created: 1 })
    assert.lengthOf(await Transaction.query().where('household_id', home.household.id), 1)
    assert.lengthOf(await RecurringItem.query().where('household_id', home.household.id), 0)
  })
})
