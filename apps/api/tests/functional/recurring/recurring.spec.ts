import { test } from '@japa/runner'
import type User from '#models/user'
import RecurringItem from '#models/recurring_item'
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
      last: '2026-10-10',
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
})
