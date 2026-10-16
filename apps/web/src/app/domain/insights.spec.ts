import {
  MIN_AVERAGE_CENTS,
  MIN_DAYS_FOR_AVERAGE,
  groupHistories,
  monthInsights,
  previousAverage,
  sameDayHistories,
  type InsightInput,
} from './insights'

function input(overrides: Partial<InsightInput> = {}): InsightInput {
  return {
    incomeCents: 0,
    expenseCents: 0,
    netCents: 0,
    groups: [],
    spendHistory: [],
    ...overrides,
  }
}

describe('previousAverage', () => {
  it('test_averages_the_three_months_before_the_last_point', () => {
    expect(previousAverage([99_999, 10_000, 20_000, 30_000, 5_000])).toBe(20_000)
  })

  it('test_uses_what_there_is_when_the_window_is_shorter', () => {
    expect(previousAverage([10_000, 30_000, 7_000])).toBe(20_000)
  })

  it('test_has_no_average_without_a_previous_month', () => {
    expect(previousAverage([7_000])).toBeNull()
    expect(previousAverage([])).toBeNull()
  })

  it('test_rounds_to_whole_cents', () => {
    expect(previousAverage([1, 1, 2, 0])).toBe(1)
  })
})

describe('groupHistories', () => {
  it('test_keeps_expense_group_series_as_month_values', () => {
    const histories = groupHistories([
      {
        bucket: 'group',
        id: 3,
        kind: 'expense',
        points: [{ amountCents: 100 }, { amountCents: 200 }],
      },
      { bucket: 'group', id: 4, kind: 'income', points: [{ amountCents: 9 }] },
      { bucket: 'private', id: null, kind: 'expense', points: [{ amountCents: 5 }] },
      { bucket: 'uncategorized', id: null, kind: 'expense', points: [{ amountCents: 5 }] },
    ])

    expect(histories).toEqual([{ groupId: 3, points: [100, 200] }])
  })
})

describe('monthInsights', () => {
  it('test_a_group_above_its_three_month_average', () => {
    const insights = monthInsights(
      input({
        expenseCents: 11_800,
        groups: [{ groupId: 5, points: [0, 0, 10_000, 10_000, 10_000, 11_800] }],
      })
    )

    expect(insights[0]).toEqual({ kind: 'groupAboveAverage', groupId: 5, percent: 18 })
  })

  it('test_a_group_below_its_average', () => {
    const insights = monthInsights(
      input({
        expenseCents: 7_500,
        groups: [{ groupId: 2, points: [10_000, 10_000, 10_000, 7_500] }],
      })
    )

    expect(insights[0]).toEqual({ kind: 'groupBelowAverage', groupId: 2, percent: 25 })
  })

  it('test_the_biggest_money_change_wins_over_the_biggest_percentage', () => {
    const insights = monthInsights(
      input({
        expenseCents: 200_000,
        groups: [
          { groupId: 1, points: [10_000, 10_000, 10_000, 20_000] },
          { groupId: 2, points: [100_000, 100_000, 100_000, 150_000] },
        ],
      })
    )

    expect(insights[0]).toEqual({ kind: 'groupAboveAverage', groupId: 2, percent: 50 })
  })

  it('test_small_changes_and_small_averages_are_not_news', () => {
    const insights = monthInsights(
      input({
        expenseCents: 20_000,
        groups: [
          { groupId: 1, points: [100_000, 100_000, 100_000, 105_000] },
          { groupId: 2, points: [MIN_AVERAGE_CENTS - 100, 0, 0, 40_000] },
        ],
      })
    )

    expect(insights.some((insight) => insight.kind === 'groupAboveAverage')).toBe(false)
  })

  it('test_the_share_of_income_saved', () => {
    const insights = monthInsights(
      input({ incomeCents: 645_000, expenseCents: 328_450, netCents: 316_550 })
    )

    expect(insights).toContainEqual({ kind: 'savedShare', percent: 49 })
  })

  it('test_spending_more_than_was_earned', () => {
    const insights = monthInsights(
      input({ incomeCents: 100_000, expenseCents: 112_000, netCents: -12_000 })
    )

    expect(insights).toContainEqual({ kind: 'overspent', percent: 12 })
  })

  it('test_group_change_comes_first_then_savings', () => {
    const insights = monthInsights(
      input({
        incomeCents: 100_000,
        expenseCents: 11_800,
        netCents: 88_200,
        groups: [{ groupId: 5, points: [10_000, 10_000, 10_000, 11_800] }],
      })
    )

    expect(insights.map((insight) => insight.kind)).toEqual(['groupAboveAverage', 'savedShare'])
  })

  it('test_without_income_total_spend_against_its_average_fills_in', () => {
    const insights = monthInsights(
      input({
        expenseCents: 60_000,
        groups: [{ groupId: 5, points: [40_000, 40_000, 40_000, 60_000] }],
        spendHistory: [40_000, 40_000, 40_000, 60_000],
      })
    )

    expect(insights).toEqual([
      { kind: 'groupAboveAverage', groupId: 5, percent: 50 },
      { kind: 'spendAboveAverage', percent: 50 },
    ])
  })

  it('test_a_first_month_falls_back_to_the_largest_group_share', () => {
    const insights = monthInsights(
      input({
        expenseCents: 50_000,
        groups: [
          { groupId: 1, points: [0, 0, 0, 30_000] },
          { groupId: 2, points: [0, 0, 0, 20_000] },
        ],
        spendHistory: [0, 0, 0, 50_000],
      })
    )

    expect(insights).toEqual([{ kind: 'groupShare', groupId: 1, percent: 60 }])
  })

  it('test_an_empty_month_has_no_insights', () => {
    expect(monthInsights(input())).toEqual([])
  })

  it('test_never_more_than_two', () => {
    const insights = monthInsights(
      input({
        incomeCents: 100_000,
        expenseCents: 60_000,
        netCents: 40_000,
        groups: [{ groupId: 5, points: [40_000, 40_000, 40_000, 60_000] }],
        spendHistory: [40_000, 40_000, 40_000, 60_000],
      })
    )

    expect(insights).toHaveLength(2)
  })

  it('test_the_same_input_always_gives_the_same_insights', () => {
    const value = input({
      incomeCents: 100_000,
      expenseCents: 30_000,
      netCents: 70_000,
      groups: [
        { groupId: 2, points: [10_000, 10_000, 10_000, 15_000] },
        { groupId: 1, points: [10_000, 10_000, 10_000, 15_000] },
      ],
    })

    expect(monthInsights(value)).toEqual(monthInsights(value))
    expect(monthInsights(value)[0]).toMatchObject({ groupId: 1 })
  })
})

describe('sameDayHistories', () => {
  const line = (groupId: number, amountCents: number, kind = 'expense') => ({
    bucket: 'group',
    groupId,
    kind,
    amountCents,
  })

  it('test_lines_up_the_previous_months_over_the_same_days_then_the_month_so_far', () => {
    const histories = sameDayHistories(
      [
        { expenseCents: 30_000, byGroup: [line(2, 30_000)] },
        { expenseCents: 50_000, byGroup: [line(1, 20_000), line(2, 30_000)] },
        { expenseCents: 0, byGroup: [] },
      ],
      {
        expenseCents: 45_000,
        byGroup: [
          line(2, 45_000),
          line(9, 300_000, 'income'),
          { bucket: 'private', groupId: null, kind: 'expense', amountCents: 5_000 },
        ],
      }
    )

    expect(histories).toEqual({
      groups: [
        { groupId: 1, points: [0, 20_000, 0, 0] },
        { groupId: 2, points: [30_000, 30_000, 0, 45_000] },
      ],
      spendHistory: [30_000, 50_000, 0, 45_000],
    })
  })
})

describe('monthInsights for the month still running', () => {
  it('test_averages_compare_the_same_days_and_say_so', () => {
    const insights = monthInsights(
      input({
        expenseCents: 60_000,
        groups: [{ groupId: 5, points: [40_000, 40_000, 40_000, 60_000] }],
        spendHistory: [40_000, 40_000, 40_000, 60_000],
        toDate: { throughDay: 16 },
      })
    )

    expect(insights).toEqual([
      { kind: 'groupAboveAverageToDate', groupId: 5, percent: 50 },
      { kind: 'spendAboveAverageToDate', percent: 50 },
    ])
  })

  it('test_a_group_with_nothing_spent_so_far_is_not_news', () => {
    const insights = monthInsights(
      input({
        expenseCents: 9_000,
        groups: [
          // Usually paid later in the month: $0 so far says nothing yet.
          { groupId: 1, points: [80_000, 80_000, 80_000, 0] },
          { groupId: 2, points: [10_000, 10_000, 10_000, 9_000] },
        ],
        toDate: { throughDay: 16 },
      })
    )

    expect(insights[0]).toEqual({ kind: 'groupBelowAverageToDate', groupId: 2, percent: 10 })
  })

  it('test_nothing_spent_so_far_is_not_a_spending_drop', () => {
    const insights = monthInsights(
      input({
        incomeCents: 300_000,
        netCents: 300_000,
        spendHistory: [40_000, 40_000, 40_000, 0],
        toDate: { throughDay: 10 },
      })
    )

    expect(insights).toEqual([{ kind: 'savedShare', percent: 100 }])
  })

  it('test_averages_wait_for_the_first_week', () => {
    const early = input({
      expenseCents: 60_000,
      groups: [{ groupId: 5, points: [40_000, 40_000, 40_000, 60_000] }],
      spendHistory: [40_000, 40_000, 40_000, 60_000],
      toDate: { throughDay: MIN_DAYS_FOR_AVERAGE - 1 },
    })

    expect(monthInsights(early)).toEqual([{ kind: 'groupShare', groupId: 5, percent: 100 }])
    expect(
      monthInsights({ ...early, toDate: { throughDay: MIN_DAYS_FOR_AVERAGE } })[0]
    ).toMatchObject({ kind: 'groupAboveAverageToDate' })
  })

  it('test_a_closed_month_keeps_full_month_averages_and_its_zero_groups', () => {
    const insights = monthInsights(
      input({
        expenseCents: 9_000,
        groups: [
          { groupId: 1, points: [80_000, 80_000, 80_000, 0] },
          { groupId: 2, points: [10_000, 10_000, 10_000, 9_000] },
        ],
      })
    )

    expect(insights[0]).toEqual({ kind: 'groupBelowAverage', groupId: 1, percent: 100 })
  })
})
