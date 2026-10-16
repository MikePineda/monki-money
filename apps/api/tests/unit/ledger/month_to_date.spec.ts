import { test } from '@japa/runner'
import { posting, transferLegs } from '#tests/helpers/postings'
import {
  dayReached,
  previousMonthsToDate,
  previousToDate,
  sameDaysOf,
} from '#domain/reports/month_to_date'

const GROCERIES = { categoryId: 10, groupId: 1, groupKind: 'expense' as const }
const RENT = { categoryId: 20, groupId: 2, groupKind: 'expense' as const }
const SALARY = { categoryId: 90, groupId: 9, groupKind: 'income' as const }

test.group('Reports: month to date', () => {
  test('test_only_the_running_month_has_reached_a_day', ({ assert }) => {
    assert.equal(dayReached('2026-10', '2026-10-16'), 16)
    assert.equal(dayReached('2026-10', '2026-10-01'), 1)
    // A closed month and a month that has not started have no "so far".
    assert.isNull(dayReached('2026-09', '2026-10-16'))
    assert.isNull(dayReached('2026-11', '2026-10-16'))
  })

  test('test_same_days_are_capped_at_the_length_of_a_shorter_month', ({ assert }) => {
    assert.deepEqual(sameDaysOf('2026-09', 16), {
      from: '2026-09-01',
      to: '2026-09-16',
      throughDay: 16,
    })
    // 31 October against September (30 days) and 31 March against February.
    assert.deepEqual(sameDaysOf('2026-09', 31), {
      from: '2026-09-01',
      to: '2026-09-30',
      throughDay: 30,
    })
    assert.equal(sameDaysOf('2026-02', 31).throughDay, 28)
    assert.equal(sameDaysOf('2028-02', 30).throughDay, 29)
  })

  test('test_running_month_compares_with_the_previous_month_over_the_same_days', ({ assert }) => {
    const postings = [
      posting({ ...RENT, date: '2026-09-01', amountCents: -48_000 }),
      posting({ ...GROCERIES, date: '2026-09-16', amountCents: -2_000 }),
      // After the 16th of September: not part of "the same point in September".
      posting({ ...GROCERIES, date: '2026-09-17', amountCents: -9_000 }),
      posting({ ...SALARY, kind: 'income', date: '2026-09-28', amountCents: 300_000 }),
      // The running month itself never counts in its comparison base.
      posting({ ...GROCERIES, date: '2026-10-02', amountCents: -1_000 }),
    ]

    assert.deepEqual(previousToDate(postings, '2026-10', '2026-10-16'), {
      throughDay: 16,
      incomeCents: 0,
      expenseCents: 50_000,
      netCents: -50_000,
    })
  })

  test('test_closed_months_have_no_month_to_date_comparison', ({ assert }) => {
    const postings = [posting({ ...GROCERIES, date: '2026-08-10', amountCents: -1_000 })]

    assert.isNull(previousToDate(postings, '2026-09', '2026-10-16'))
    assert.isNull(previousMonthsToDate(postings, '2026-09', '2026-10-16'))
  })

  test('test_month_to_date_follows_the_month_summary_rules', ({ assert }) => {
    const postings = [
      posting({ ...GROCERIES, date: '2026-09-03', amountCents: -8_000 }),
      // A refund reduces its category; a transfer is neither income nor spending.
      posting({ ...GROCERIES, kind: 'income', date: '2026-09-05', amountCents: 2_000 }),
      ...transferLegs(50_000, { date: '2026-09-04' }),
    ]

    assert.deepEqual(previousToDate(postings, '2026-10', '2026-10-10'), {
      throughDay: 10,
      incomeCents: 0,
      expenseCents: 6_000,
      netCents: -6_000,
    })
  })

  test('test_previous_three_months_cover_the_same_days_oldest_first', ({ assert }) => {
    const postings = [
      posting({ ...RENT, date: '2026-07-01', amountCents: -48_000 }),
      posting({ ...GROCERIES, date: '2026-07-20', amountCents: -7_000 }),
      posting({ ...GROCERIES, date: '2026-08-10', amountCents: -3_000 }),
      // 30 September counts on the 31st of October (September has 30 days).
      posting({ ...GROCERIES, date: '2026-09-30', amountCents: -4_000 }),
      // Outside the three months before October.
      posting({ ...GROCERIES, date: '2026-06-05', amountCents: -9_999 }),
    ]

    const months = previousMonthsToDate(postings, '2026-10', '2026-10-31')

    assert.deepEqual(
      months?.map(({ month, throughDay, expenseCents }) => ({ month, throughDay, expenseCents })),
      [
        { month: '2026-07', throughDay: 31, expenseCents: 55_000 },
        { month: '2026-08', throughDay: 31, expenseCents: 3_000 },
        { month: '2026-09', throughDay: 30, expenseCents: 4_000 },
      ]
    )
    assert.deepEqual(
      months?.[0].byGroup.map((line) => [line.groupId, line.amountCents]),
      [
        [RENT.groupId, 48_000],
        [GROCERIES.groupId, 7_000],
      ]
    )

    // On the 16th, July's 20th and September's 30th are past the same point.
    const early = previousMonthsToDate(postings, '2026-10', '2026-10-16')
    assert.deepEqual(
      early?.map(({ throughDay, expenseCents }) => [throughDay, expenseCents]),
      [
        [16, 48_000],
        [16, 3_000],
        [16, 0],
      ]
    )
  })
})
