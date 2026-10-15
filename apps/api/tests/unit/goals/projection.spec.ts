import { test } from '@japa/runner'
import type { MonthTotals } from '#domain/reports/trends'
import {
  averageMonthlyNet,
  MAX_SERIES_POINTS,
  projectGoal,
  type GoalProjectionInput,
} from '#domain/goals/projection'

/** One month of totals with the given net (income only, or expense only when negative). */
function net(month: string, netCents: number): MonthTotals {
  return {
    month,
    incomeCents: Math.max(netCents, 0),
    expenseCents: Math.max(-netCents, 0),
    netCents,
  }
}

function quiet(month: string): MonthTotals {
  return { month, incomeCents: 0, expenseCents: 0, netCents: 0 }
}

function goal(overrides: Partial<GoalProjectionInput> = {}): GoalProjectionInput {
  return {
    targetCents: 500_000,
    savedCents: 80_000,
    monthlyRateCents: 60_000,
    targetDate: null,
    fromMonth: '2026-10',
    ...overrides,
  }
}

test.group('Goals: projection', () => {
  test('test_projection_uses_average_of_last_three_full_months', ({ assert }) => {
    const history = [
      net('2026-06', 99_999),
      net('2026-07', 30_000),
      net('2026-08', 60_000),
      net('2026-09', 90_000),
      net('2026-10', 500_000),
    ]

    const rate = averageMonthlyNet(history, '2026-10')
    assert.strictEqual(rate, 60_000)

    // 420,000 left at 60,000 a month: seven months from October.
    const projection = projectGoal(goal({ monthlyRateCents: rate }))
    assert.include(projection, {
      remainingCents: 420_000,
      monthsToGoal: 7,
      projectedDate: '2027-05-01',
    })
  })

  test('test_average_excludes_the_current_partial_month', ({ assert }) => {
    const history = [
      net('2026-08', 10_000),
      net('2026-09', 20_000),
      net('2026-10', 1_000_000),
      net('2026-11', 1_000_000),
    ]

    assert.strictEqual(averageMonthlyNet(history, '2026-10'), 15_000)
    // Order of the history does not matter.
    assert.strictEqual(averageMonthlyNet([...history].reverse(), '2026-10'), 15_000)
    assert.strictEqual(averageMonthlyNet(history, '2026-10', 1), 20_000)
  })

  test('test_average_is_null_without_a_full_month', ({ assert }) => {
    assert.isNull(averageMonthlyNet([], '2026-10'))
    assert.isNull(averageMonthlyNet([net('2026-10', 50_000)], '2026-10'))
  })

  test('test_average_ignores_months_before_the_first_recorded_activity', ({ assert }) => {
    // A household that started in September: July and August are not history yet.
    assert.strictEqual(
      averageMonthlyNet([quiet('2026-07'), quiet('2026-08'), net('2026-09', 30_000)], '2026-10'),
      30_000
    )
    // A quiet month after the first activity counts as zero.
    assert.strictEqual(
      averageMonthlyNet(
        [net('2026-07', 30_000), quiet('2026-08'), net('2026-09', 30_000)],
        '2026-10'
      ),
      20_000
    )
    assert.isNull(averageMonthlyNet([quiet('2026-08'), quiet('2026-09')], '2026-10'))
  })

  test('test_average_rounds_to_whole_cents', ({ assert }) => {
    assert.strictEqual(
      averageMonthlyNet([net('2026-07', 10), net('2026-08', 10), net('2026-09', 11)], '2026-10'),
      10
    )
    const almostZero = averageMonthlyNet(
      [net('2026-07', -1), quiet('2026-08'), quiet('2026-09')],
      '2026-10'
    )
    assert.isTrue(Object.is(almostZero, 0), 'never -0')
    assert.strictEqual(
      averageMonthlyNet([net('2026-08', -10_000), net('2026-09', -20_001)], '2026-10'),
      -15_000
    )
  })

  test('test_projection_is_open_ended_when_rate_is_zero_or_negative', ({ assert }) => {
    for (const monthlyRateCents of [0, -5_000, null]) {
      const projection = projectGoal(goal({ monthlyRateCents, targetDate: '2027-06-30' }))

      assert.deepEqual(
        projection,
        {
          remainingCents: 420_000,
          monthsToGoal: null,
          projectedDate: null,
          // Still useful: what it would take.
          requiredMonthlyForTargetDate: 52_500,
          onTrack: null,
          series: [{ month: '2026-10', projectedCents: 80_000 }],
        },
        String(monthlyRateCents)
      )
      assert.isNull(projectGoal(goal({ monthlyRateCents })).onTrack)
    }
  })

  test('test_required_monthly_amount_divides_remaining_by_months_to_target', ({ assert }) => {
    // October -> June: eight months, rounded up to whole cents.
    const required = (targetDate: string | null, savedCents = 0) =>
      projectGoal(goal({ targetCents: 100_001, savedCents, targetDate }))

    assert.strictEqual(required('2027-06-15').requiredMonthlyForTargetDate, 12_501)
    assert.strictEqual(required('2027-06-15', 20_001).requiredMonthlyForTargetDate, 10_000)
    assert.isNull(required(null).requiredMonthlyForTargetDate)
    // Due this month: all of it now.
    assert.strictEqual(required('2026-10-31').requiredMonthlyForTargetDate, 100_001)
    // Already past: nothing to divide by, and certainly not on track.
    assert.isNull(required('2026-09-30').requiredMonthlyForTargetDate)
    assert.isFalse(required('2026-09-30').onTrack)
    assert.isFalse(
      projectGoal(goal({ monthlyRateCents: null, targetDate: '2026-09-30' })).onTrack,
      'past due without a rate'
    )
  })

  test('test_reached_goal_projects_zero_months', ({ assert }) => {
    const reached = projectGoal(
      goal({ savedCents: 600_000, monthlyRateCents: null, targetDate: '2027-06-30' })
    )

    assert.deepEqual(reached, {
      remainingCents: 0,
      monthsToGoal: 0,
      projectedDate: null,
      requiredMonthlyForTargetDate: 0,
      onTrack: true,
      series: [{ month: '2026-10', projectedCents: 600_000 }],
    })
    assert.include(projectGoal(goal({ savedCents: 500_000 })), {
      remainingCents: 0,
      monthsToGoal: 0,
      requiredMonthlyForTargetDate: null,
      onTrack: null,
    })
  })

  test('test_projection_series_is_capped_at_24_months', ({ assert }) => {
    const long = projectGoal(
      goal({ targetCents: 1_000_000, savedCents: 0, monthlyRateCents: 10_000 })
    )
    assert.strictEqual(long.monthsToGoal, 100)
    assert.lengthOf(long.series, MAX_SERIES_POINTS)
    assert.strictEqual(MAX_SERIES_POINTS, 24)
    assert.deepEqual(long.series[0], { month: '2026-10', projectedCents: 0 })
    assert.deepEqual(long.series[23], { month: '2028-09', projectedCents: 230_000 })

    // A short goal stops at the month it is reached.
    const short = projectGoal(goal({ targetCents: 100_000, savedCents: 5_000 }))
    assert.deepEqual(short.series, [
      { month: '2026-10', projectedCents: 5_000 },
      { month: '2026-11', projectedCents: 65_000 },
      { month: '2026-12', projectedCents: 125_000 },
    ])
    assert.strictEqual(short.monthsToGoal, 2)
  })

  test('test_on_track_compares_projected_date_with_target_date', ({ assert }) => {
    // 30,000 left at 10,000 a month: reached in January 2027.
    const onTrack = (targetDate: string | null) =>
      projectGoal(
        goal({ targetCents: 40_000, savedCents: 10_000, monthlyRateCents: 10_000, targetDate })
      )

    assert.strictEqual(onTrack('2027-01-31').projectedDate, '2027-01-01')
    assert.isTrue(onTrack('2027-01-31').onTrack)
    assert.isTrue(onTrack('2027-01-01').onTrack)
    assert.isFalse(onTrack('2026-12-31').onTrack)
    assert.isNull(onTrack(null).onTrack)
    // Paying exactly the required amount is on track.
    const required = onTrack('2026-12-15').requiredMonthlyForTargetDate!
    assert.strictEqual(required, 15_000)
    assert.isTrue(
      projectGoal(
        goal({
          targetCents: 40_000,
          savedCents: 10_000,
          monthlyRateCents: required,
          targetDate: '2026-12-15',
        })
      ).onTrack
    )
  })

  test('test_projection_beyond_a_hundred_years_is_open_ended', ({ assert }) => {
    const projection = projectGoal(
      goal({ targetCents: 2_000_000_000, savedCents: 0, monthlyRateCents: 1 })
    )
    assert.isNull(projection.monthsToGoal)
    assert.isNull(projection.projectedDate)
    assert.lengthOf(projection.series, 1)
  })
})
