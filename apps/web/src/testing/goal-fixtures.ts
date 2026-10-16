import type { Goal, GoalWithProjection } from '../app/core/api/api-types'
import type { GoalProjection } from '../app/features/goals/data-access/goals.api'

/** A synthetic savings goal of the household ($1,200 saved of $5,000, no date). */
export function aGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 1,
    name: 'Emergency fund',
    targetCents: 500_000,
    targetDate: null,
    startingCents: 120_000,
    monthlyContributionCents: null,
    accountId: null,
    userId: null,
    status: 'active',
    reachedAt: null,
    sortOrder: 0,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  } as Goal
}

/**
 * Its projection: $500 a month from the last 3 months, reached in June 2027.
 * No account, so the history is today's saved amount only.
 */
export function aProjection(overrides: Partial<GoalProjection> = {}): GoalProjection {
  const saved = overrides.savedCents ?? 120_000
  const rate = overrides.monthlyRateCents === undefined ? 50_000 : overrides.monthlyRateCents
  return {
    goalId: 1,
    savedCents: saved,
    targetCents: 500_000,
    rateSource: 'average',
    monthlyRateCents: rate,
    remainingCents: 380_000,
    monthsToGoal: 8,
    projectedDate: '2027-06-01',
    requiredMonthlyForTargetDate: null,
    onTrack: null,
    series: Array.from({ length: 9 }, (_, index) => ({
      month: monthAfter('2026-10', index),
      projectedCents: saved + index * (rate ?? 0),
    })),
    history: [{ month: '2026-10', balanceCents: saved }],
    ...overrides,
  } as GoalProjection
}

/** An open-ended projection: no usable rate, so no date. */
export function anOpenEndedProjection(overrides: Partial<GoalProjection> = {}): GoalProjection {
  return aProjection({
    rateSource: 'none',
    monthlyRateCents: null,
    monthsToGoal: null,
    projectedDate: null,
    onTrack: null,
    series: [{ month: '2026-10', projectedCents: 120_000 }],
    ...overrides,
  })
}

/** A projection with nothing left to save: $5,000 of $5,000. */
export function aReachedProjection(overrides: Partial<GoalProjection> = {}): GoalProjection {
  return aProjection({
    savedCents: 500_000,
    remainingCents: 0,
    monthsToGoal: 0,
    projectedDate: null,
    series: [{ month: '2026-10', projectedCents: 500_000 }],
    ...overrides,
  })
}

/**
 * Month-end balances of a tracked account from April to October 2026,
 * ending at the default $1,200 saved.
 */
export function aTrackedHistory(): GoalProjection['history'] {
  return [20_000, 35_000, 50_000, 70_000, 85_000, 100_000, 120_000].map((balanceCents, index) => ({
    month: monthAfter('2026-04', index),
    balanceCents,
  }))
}

/** One row of `GET /goals?include=projection`. */
export function aGoalWithProjection(
  goal: Partial<Goal> = {},
  projection: GoalProjection | null = aProjection({ goalId: goal.id ?? 1 })
): GoalWithProjection {
  return { ...aGoal(goal), projection } as GoalWithProjection
}

function monthAfter(month: string, count: number): string {
  const [year = 0, index = 1] = month.split('-').map(Number)
  const total = year * 12 + (index - 1) + count
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}
