import { test } from '@japa/runner'
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
      amountCents: -57_500,
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
    const { owner, household, categories } = await seededLedger()

    const response = await client.get('/api/v1/reports/month?month=2026-10').actingAs(owner)

    response.assertStatus(200)
    const { topMovers, ...summary } = response.body().data
    // Hand-computed totals.
    assert.include(summary, {
      month: '2026-10',
      from: '2026-10-01',
      to: '2026-10-31',
      // 80 - 20 + 100 + 575 + 15
      expenseCents: 75_000,
      incomeCents: 300_000,
      netCents: 225_000,
      uncategorizedCents: 1_500,
      pendingCents: 57_500,
      transactionCount: 6,
    })
    const groceries = summary.byCategory.find(
      (line: any) => line.categoryId === categories.groceries.id
    )
    // 80 - 20 refund + 70 split line.
    assert.equal(groceries.amountCents, 13_000)
    // And exactly what the pure domain function says over the same postings.
    const postings = await new PostingsRepository().between(household, '2026-09-01', '2026-10-31')
    assert.deepEqual(summary, summarizeMonth(postingsFor(postings, owner.id), '2026-10'))
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
        expenseCents: 57_500,
        netCents: -57_500,
      },
    ])

    const onlyMember = await client
      .get(`/api/v1/reports/month?month=2026-10&paidByUserId=${member.id}`)
      .actingAs(owner)
    assert.include(onlyMember.body().data, { expenseCents: 11_500, incomeCents: 300_000 })
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

    response.assertBodyContains({ data: { month: '2026-10', expenseCents: 75_000 } })
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
      [0, 9_999, 75_000]
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
      availableBalanceCents: 215_001,
    })
    assert.include(savings, { clearedBalanceCents: 50_000, availableBalanceCents: 50_000 })
    assert.include(response.body().data, {
      clearedBalanceCents: 322_501,
      availableBalanceCents: 265_001,
    })

    const list = await client.get('/api/v1/accounts').actingAs(owner)
    assert.include(list.body().data[0], {
      clearedBalanceCents: 272_501,
      availableBalanceCents: 215_001,
    })
  })
})
