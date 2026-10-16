import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import MonthlyInsight from '#models/monthly_insight'
import { postingsFor } from '#domain/ledger/privacy'
import { createHousehold } from '#tests/helpers/household'
import { summarizeMonth } from '#domain/reports/month_summary'
import PostingsRepository from '#repositories/postings_repository'
import { categoryBySlug, freezeClock } from '#tests/helpers/ledger'
import { TransactionFactory, TransferFactory } from '#database/factories/transaction_factory'

/**
 * A synthetic month: groceries 80.00 with a 20.00 refund, a 100.00
 * supermarket receipt split 70/30 (groceries/alcohol), rent 480.00
 * pending, salary 3,000.00, an uncategorized 15.00, a 500.00 transfer and
 * one September expense that must stay out of October.
 */
async function seededLedger() {
  const fixture = await createHousehold({
    users: 2,
    taxonomy: true,
    accounts: [{ name: 'Everyday', openingBalanceCents: 50_000 }, { name: 'Savings' }],
  })
  const { household, owner, member, accounts } = fixture
  const [groceries, alcohol, rent, salary] = await Promise.all(
    ['groceries', 'alcohol', 'rent', 'salary'].map((slug) => categoryBySlug(household.id, slug))
  )
  const base = { householdId: household.id, accountId: accounts[0].id, createdByUserId: owner.id }

  await TransactionFactory.merge([
    {
      ...base,
      date: '2026-10-02',
      amountCents: -8_000,
      categoryId: groceries.id,
      paidByUserId: owner.id,
    },
    {
      ...base,
      kind: 'income',
      date: '2026-10-09',
      amountCents: 2_000,
      categoryId: groceries.id,
      paidByUserId: owner.id,
    },
    {
      ...base,
      date: '2026-10-01',
      amountCents: -48_000,
      categoryId: rent.id,
      paidByUserId: null,
      status: 'pending',
    },
    {
      ...base,
      kind: 'income',
      date: '2026-10-15',
      amountCents: 300_000,
      categoryId: salary.id,
      paidByUserId: member.id,
    },
    { ...base, date: '2026-10-20', amountCents: -1_500, paidByUserId: member.id },
    {
      ...base,
      date: '2026-09-30',
      amountCents: -9_999,
      categoryId: groceries.id,
      paidByUserId: owner.id,
    },
  ]).createMany(6)

  const receipt = await TransactionFactory.merge({
    ...base,
    date: '2026-10-11',
    amountCents: -10_000,
    paidByUserId: member.id,
  }).create()
  await receipt.related('splits').createMany([
    { householdId: household.id, categoryId: groceries.id, amountCents: -7_000, sortOrder: 0 },
    { householdId: household.id, categoryId: alcohol.id, amountCents: -3_000, sortOrder: 1 },
  ])
  await receipt.merge({ isSplit: true }).save()

  await TransferFactory.merge({
    householdId: household.id,
    fromAccountId: accounts[0].id,
    toAccountId: accounts[1].id,
    date: '2026-10-12',
    amountCents: 50_000,
  }).create()

  return { ...fixture, categories: { groceries, alcohol, rent, salary } }
}

test.group('Reports', () => {
  test('test_month_report_matches_domain_summary_for_seeded_ledger', async ({ client, assert }) => {
    const { owner, member, household, categories } = await seededLedger()

    const response = await client.get('/api/v1/reports/month?month=2026-10').actingAs(owner)

    response.assertStatus(200)
    const { topMovers, committed, previous, topExpenses, insight, ...summary } =
      response.body().data
    assert.exists(previous)
    assert.isArray(topExpenses)
    assert.exists(insight)
    // No recurring payments yet: nothing committed.
    assert.deepEqual(committed, { paidCents: 0, upcomingCents: 0, recurringCount: 0, items: [] })
    // Hand-computed totals.
    assert.include(summary, {
      month: '2026-10',
      from: '2026-10-01',
      to: '2026-10-31',
      // 80 - 20 + 100 + 480 + 15
      expenseCents: 65_500,
      incomeCents: 300_000,
      netCents: 234_500,
      uncategorizedCents: 1_500,
      pendingCents: 48_000,
      transactionCount: 6,
    })
    const groceries = summary.byCategory.find(
      (line: any) => line.categoryId === categories.groceries.id
    )
    // 80 - 20 refund + 70 split line.
    assert.equal(groceries.amountCents, 13_000)
    // And exactly what the pure domain function says over the same postings.
    const postings = await new PostingsRepository().between(household, '2026-09-01', '2026-10-31')
    assert.deepEqual(
      summary,
      summarizeMonth(
        postingsFor(postings, { userId: owner.id, memberIds: new Set([owner.id, member.id]) }),
        '2026-10'
      )
    )
    assert.deepEqual(
      topMovers.find((mover: any) => mover.categoryId === categories.groceries.id),
      {
        categoryId: categories.groceries.id,
        groupId: categories.groceries.categoryGroupId,
        previousCents: 9_999,
        currentCents: 13_000,
        deltaCents: 3_001,
      }
    )
  })

  test('test_month_report_groups_by_person_with_joint_bucket', async ({ client, assert }) => {
    const { owner, member } = await seededLedger()

    const response = await client.get('/api/v1/reports/month?month=2026-10').actingAs(member)

    assert.deepEqual(response.body().data.byPerson, [
      { bucket: 'member', userId: owner.id, incomeCents: 0, expenseCents: 6_000, netCents: -6_000 },
      {
        bucket: 'member',
        userId: member.id,
        incomeCents: 300_000,
        expenseCents: 11_500,
        netCents: 288_500,
      },
      {
        bucket: 'joint',
        userId: null,
        incomeCents: 0,
        expenseCents: 48_000,
        netCents: -48_000,
      },
    ])

    const onlyMember = await client
      .get(`/api/v1/reports/month?month=2026-10&paidByUserId=${member.id}`)
      .actingAs(owner)
    assert.include(onlyMember.body().data, { expenseCents: 11_500, incomeCents: 300_000 })
  })

  test('test_month_report_carries_the_previous_month_totals', async ({ client, assert }) => {
    const { owner } = await seededLedger()

    const october = await client.get('/api/v1/reports/month?month=2026-10').actingAs(owner)
    const november = await client.get('/api/v1/reports/month?month=2026-11').actingAs(owner)

    october.assertStatus(200)
    // September had one 99.99 grocery expense and nothing else.
    assert.deepEqual(october.body().data.previous, {
      incomeCents: 0,
      expenseCents: 9_999,
      netCents: -9_999,
    })
    // November's previous month is October, with the same rules as its own totals.
    assert.deepEqual(november.body().data.previous, {
      incomeCents: 300_000,
      expenseCents: 65_500,
      netCents: 234_500,
    })
  })

  test('test_previous_month_totals_follow_the_payer_filter', async ({ client, assert }) => {
    const { owner } = await seededLedger()

    const response = await client
      .get(`/api/v1/reports/month?month=2026-11&paidByUserId=${owner.id}`)
      .actingAs(owner)

    // October paid by the owner: 80.00 groceries less the 20.00 refund.
    assert.deepEqual(response.body().data.previous, {
      incomeCents: 0,
      expenseCents: 6_000,
      netCents: -6_000,
    })
  })

  test('test_month_report_lists_the_five_largest_expenses_of_the_month', async ({
    client,
    assert,
  }) => {
    const { owner, member, household, accounts } = await createHousehold({
      users: 2,
      taxonomy: true,
      accounts: [{ name: 'Everyday' }, { name: 'Savings' }],
    })
    const groceries = await categoryBySlug(household.id, 'groceries')
    const base = { householdId: household.id, accountId: accounts[0].id, createdByUserId: owner.id }
    const expense = (date: string, amountCents: number, extra: Record<string, unknown> = {}) =>
      TransactionFactory.merge({ ...base, date, amountCents, ...extra }).create()

    const rent = await expense('2026-10-01', -48_000, {
      payee: 'Landlord',
      description: 'October rent',
      paidByUserId: null,
    })
    const groceryRun = await expense('2026-10-02', -8_000, {
      payee: 'Corner Grocer',
      categoryId: groceries.id,
      paidByUserId: owner.id,
    })
    const receipt = await TransactionFactory.merge({
      ...base,
      date: '2026-10-11',
      amountCents: -10_000,
      payee: 'Supermarket',
      paidByUserId: member.id,
    })
      .apply('split')
      .create()
    const coffee = await expense('2026-10-20', -1_500, { paidByUserId: member.id })
    const snack = await expense('2026-10-21', -300, { paidByUserId: owner.id })
    // Smaller than the five above: left out.
    await expense('2026-10-22', -200, { paidByUserId: owner.id })
    // Never expenses of October: income, a transfer, September.
    await TransactionFactory.merge({ ...base, date: '2026-10-15', amountCents: 300_000 })
      .apply('income')
      .create()
    await TransferFactory.merge({
      householdId: household.id,
      fromAccountId: accounts[0].id,
      toAccountId: accounts[1].id,
      date: '2026-10-12',
      amountCents: 90_000,
    }).create()
    await expense('2026-09-30', -99_999)

    const response = await client.get('/api/v1/reports/month?month=2026-10').actingAs(owner)

    response.assertStatus(200)
    const top = response.body().data.topExpenses
    assert.deepEqual(
      top.map((row: any) => row.id),
      [rent.id, receipt.id, groceryRun.id, coffee.id, snack.id]
    )
    assert.deepEqual(top[0], {
      id: rent.id,
      date: '2026-10-01',
      payee: 'Landlord',
      description: 'October rent',
      amountCents: -48_000,
      categoryId: null,
      isSplit: false,
      paidByUserId: null,
      isMasked: false,
    })
    assert.include(top[1], { isSplit: true, categoryId: null, amountCents: -10_000 })
    assert.include(top[2], { categoryId: groceries.id, paidByUserId: owner.id })

    const memberOnly = await client
      .get(`/api/v1/reports/month?month=2026-10&paidByUserId=${member.id}`)
      .actingAs(owner)
    assert.deepEqual(
      memberOnly.body().data.topExpenses.map((row: any) => row.id),
      [receipt.id, coffee.id]
    )
  })

  test('test_month_report_says_whether_the_readers_summary_is_stored', async ({
    client,
    assert,
  }) => {
    const { owner, member, household } = await seededLedger()
    await member.merge({ locale: 'es' }).save()
    const generatedAt = DateTime.fromISO('2026-11-01T08:00:00Z')
    await MonthlyInsight.create({
      householdId: household.id,
      month: '2026-10',
      locale: 'en',
      headline: 'October in short',
      bodyMarkdown: 'Body',
      highlights: [],
      inputJson: {
        month: '2026-10',
        currencyCode: 'AUD',
        totals: { incomeCents: 0, expenseCents: 0, netCents: 0 },
        byCategory: [],
      },
      model: 'fake',
      generatedAt,
    })

    const english = await client.get('/api/v1/reports/month?month=2026-10').actingAs(owner)
    const spanish = await client.get('/api/v1/reports/month?month=2026-10').actingAs(member)
    const september = await client.get('/api/v1/reports/month?month=2026-09').actingAs(owner)

    assert.deepEqual(english.body().data.insight, {
      available: true,
      generatedAt: '2026-11-01T08:00:00.000Z',
      locale: 'en',
    })
    // Stored in English only: the Spanish reader would have to generate theirs.
    assert.deepEqual(spanish.body().data.insight, {
      available: false,
      generatedAt: null,
      locale: 'es',
    })
    assert.deepEqual(september.body().data.insight, {
      available: false,
      generatedAt: null,
      locale: 'en',
    })
  })

  test('test_month_report_rejects_a_payer_from_another_household', async ({ client }) => {
    const { owner } = await seededLedger()
    const outsider = await createHousehold()

    const response = await client
      .get(`/api/v1/reports/month?paidByUserId=${outsider.owner.id}`)
      .actingAs(owner)

    response.assertStatus(422)
    response.assertBodyContains({ errors: [{ field: 'paidByUserId', rule: 'database.exists' }] })
  })

  test('test_month_report_defaults_to_the_current_month_in_household_timezone', async ({
    client,
    cleanup,
  }) => {
    // Still September in UTC, already October in Brisbane.
    cleanup(freezeClock('2026-09-30T20:00:00Z'))
    const { owner } = await seededLedger()

    const response = await client.get('/api/v1/reports/month').actingAs(owner)

    response.assertBodyContains({ data: { month: '2026-10', expenseCents: 65_500 } })
  })

  test('test_trend_report_has_one_point_per_month', async ({ client, assert, cleanup }) => {
    cleanup(freezeClock('2026-10-20T00:00:00Z'))
    const { owner, categories } = await seededLedger()

    const response = await client
      .get('/api/v1/reports/trend?months=3&groupBy=category')
      .actingAs(owner)

    response.assertStatus(200)
    const trend = response.body().data
    assert.deepEqual(trend.months, ['2026-08', '2026-09', '2026-10'])
    assert.equal(trend.groupBy, 'category')
    assert.deepEqual(
      trend.totals.map((point: any) => point.expenseCents),
      [0, 9_999, 65_500]
    )
    const groceries = trend.series.find((series: any) => series.id === categories.groceries.id)
    assert.deepEqual(
      groceries.points.map((point: any) => point.amountCents),
      [0, 9_999, 13_000]
    )

    const tooLong = await client.get('/api/v1/reports/trend?months=25').actingAs(owner)
    tooLong.assertStatus(422)
  })

  test('test_category_report_returns_monthly_amounts', async ({ client }) => {
    const { owner, categories } = await seededLedger()

    const response = await client
      .get(`/api/v1/reports/category/${categories.salary.id}?months=2&month=2026-10`)
      .actingAs(owner)

    response.assertStatus(200)
    response.assertBodyContains({
      data: {
        months: ['2026-09', '2026-10'],
        categoryId: categories.salary.id,
        kind: 'income',
        totalCents: 300_000,
        averageCents: 150_000,
        points: [
          { month: '2026-09', amountCents: 0 },
          { month: '2026-10', amountCents: 300_000 },
        ],
      },
    })
  })

  test('test_balances_report_sums_opening_balance_and_ledger', async ({ client, assert }) => {
    const { owner, accounts } = await seededLedger()

    const response = await client.get('/api/v1/reports/balances').actingAs(owner)

    response.assertStatus(200)
    const [everyday, savings] = response.body().data.accounts
    // 500.00 opening - 99.99 - 80 + 20 + 3000 - 15 - 100 - 500 (transfer) = 2,725.01 cleared;
    // the pending rent (480.00) only reduces the available balance.
    assert.include(everyday, {
      accountId: accounts[0].id,
      clearedBalanceCents: 272_501,
      availableBalanceCents: 224_501,
    })
    assert.include(savings, { clearedBalanceCents: 50_000, availableBalanceCents: 50_000 })
    assert.deepEqual(response.body().data.totals, {
      AUD: { clearedBalanceCents: 322_501, availableBalanceCents: 274_501 },
    })

    const list = await client.get('/api/v1/accounts').actingAs(owner)
    assert.include(list.body().data[0], {
      clearedBalanceCents: 272_501,
      availableBalanceCents: 224_501,
    })
  })

  test('test_balance_totals_are_grouped_by_currency', async ({ client, assert }) => {
    const { owner, household, accounts } = await createHousehold({
      accounts: [{ name: 'Everyday', openingBalanceCents: 1_000 }],
    })
    const wise = await household
      .related('accounts')
      .create({ name: 'Wise USD', kind: 'wallet', currencyCode: 'USD', openingBalanceCents: 700 })
    await TransactionFactory.merge({
      householdId: household.id,
      accountId: accounts[0].id,
      amountCents: -100,
    }).create()

    const response = await client.get('/api/v1/reports/balances').actingAs(owner)

    assert.deepEqual(response.body().data.totals, {
      AUD: { clearedBalanceCents: 900, availableBalanceCents: 900 },
      USD: { clearedBalanceCents: 700, availableBalanceCents: 700 },
    })
    assert.include(
      response.body().data.accounts.find((row: any) => row.accountId === wise.id),
      { currencyCode: 'USD', clearedBalanceCents: 700 }
    )
  })
})
