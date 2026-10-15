import { test } from '@japa/runner'
import { summarizeMonth } from '#domain/reports/month_summary'
import { posting, transferLegs } from '#tests/helpers/postings'
import { breakdownTrend, categoryTrend, topMovers, trend } from '#domain/reports/trends'

const GROCERIES = { categoryId: 10, groupId: 1, groupKind: 'expense' as const }
const RESTAURANTS = { categoryId: 11, groupId: 1, groupKind: 'expense' as const }
const RENT = { categoryId: 20, groupId: 2, groupKind: 'expense' as const }
const SALARY = { categoryId: 90, groupId: 9, groupKind: 'income' as const }

const MONTHS = ['2026-08', '2026-09', '2026-10']

test.group('Reports: trends', () => {
  test('test_trend_has_one_point_per_month_with_zeros', ({ assert }) => {
    const postings = [
      posting({ ...GROCERIES, date: '2026-08-03', amountCents: -1_000 }),
      posting({ ...SALARY, kind: 'income', date: '2026-10-01', amountCents: 5_000 }),
      posting({ ...RENT, date: '2026-10-02', amountCents: -2_000 }),
      ...transferLegs(9_999, { date: '2026-09-15' }),
      // Outside the window.
      posting({ ...RENT, date: '2026-07-31', amountCents: -7_000 }),
    ]

    assert.deepEqual(trend(postings, MONTHS), [
      { month: '2026-08', incomeCents: 0, expenseCents: 1_000, netCents: -1_000 },
      { month: '2026-09', incomeCents: 0, expenseCents: 0, netCents: 0 },
      { month: '2026-10', incomeCents: 5_000, expenseCents: 2_000, netCents: 3_000 },
    ])
  })

  test('test_breakdown_trend_by_group_and_by_category', ({ assert }) => {
    const postings = [
      posting({ ...GROCERIES, date: '2026-08-03', amountCents: -1_000 }),
      posting({ ...RESTAURANTS, date: '2026-10-03', amountCents: -500 }),
      posting({ ...RENT, date: '2026-10-02', amountCents: -2_000 }),
    ]

    const byGroup = breakdownTrend(postings, MONTHS, 'group')
    assert.deepEqual(
      byGroup.map((series) => [series.bucket, series.id, series.totalCents]),
      [
        ['group', 2, 2_000],
        ['group', 1, 1_500],
      ]
    )
    assert.deepEqual(byGroup[1].points, [
      { month: '2026-08', amountCents: 1_000 },
      { month: '2026-09', amountCents: 0 },
      { month: '2026-10', amountCents: 500 },
    ])

    const byCategory = breakdownTrend(postings, MONTHS, 'category')
    assert.deepEqual(
      byCategory.map((series) => [series.bucket, series.id, series.totalCents]),
      [
        ['category', RENT.categoryId, 2_000],
        ['category', GROCERIES.categoryId, 1_000],
        ['category', RESTAURANTS.categoryId, 500],
      ]
    )
  })

  test('test_category_trend_uses_the_category_side', ({ assert }) => {
    const postings = [
      posting({ ...GROCERIES, date: '2026-08-03', amountCents: -1_000 }),
      posting({ ...GROCERIES, kind: 'income', date: '2026-08-20', amountCents: 200 }),
      posting({ ...GROCERIES, date: '2026-10-03', amountCents: -2_000 }),
      posting({ ...RENT, date: '2026-10-03', amountCents: -9_000 }),
    ]

    const series = categoryTrend(postings, { id: GROCERIES.categoryId, kind: 'expense' }, MONTHS)

    assert.deepEqual(series, {
      categoryId: GROCERIES.categoryId,
      kind: 'expense',
      totalCents: 2_800,
      averageCents: 933,
      points: [
        { month: '2026-08', amountCents: 800 },
        { month: '2026-09', amountCents: 0 },
        { month: '2026-10', amountCents: 2_000 },
      ],
    })
  })

  test('test_top_movers_ranks_expense_categories_by_change', ({ assert }) => {
    const previous = summarizeMonth(
      [
        posting({ ...GROCERIES, date: '2026-09-03', amountCents: -10_000 }),
        posting({ ...RESTAURANTS, date: '2026-09-03', amountCents: -2_000 }),
        posting({ ...RENT, date: '2026-09-03', amountCents: -50_000 }),
        posting({ ...SALARY, kind: 'income', date: '2026-09-03', amountCents: 10_000 }),
      ],
      '2026-09'
    )
    const current = summarizeMonth(
      [
        posting({ ...GROCERIES, date: '2026-10-03', amountCents: -13_000 }),
        posting({ ...RENT, date: '2026-10-03', amountCents: -50_000 }),
        posting({ ...SALARY, kind: 'income', date: '2026-10-03', amountCents: 90_000 }),
      ],
      '2026-10'
    )

    assert.deepEqual(topMovers(previous, current), [
      {
        categoryId: GROCERIES.categoryId,
        groupId: 1,
        previousCents: 10_000,
        currentCents: 13_000,
        deltaCents: 3_000,
      },
      {
        categoryId: RESTAURANTS.categoryId,
        groupId: 1,
        previousCents: 2_000,
        currentCents: 0,
        deltaCents: -2_000,
      },
    ])
    assert.lengthOf(topMovers(previous, current, 1), 1)
  })
})
