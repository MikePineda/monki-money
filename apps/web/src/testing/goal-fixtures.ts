import type { Goal } from '../app/core/api/api-types'
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

/** Its projection: $500 a month from the last 3 months, reached in June 2027. */
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

function monthAfter(month: string, count: number): string {
  const [year = 0, index = 1] = month.split('-').map(Number)
  const total = year * 12 + (index - 1) + count
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}
