import type { GoalStatus } from '@monkimoney/shared'
import type { GoalProjection } from '#domain/goals/projection'

/** Inputs of GoalService. Amounts are integer cents, dates 'YYYY-MM-DD'. */

export interface CreateGoalInput {
  name: string
  targetCents: number
  targetDate?: string | null
  /** Saved before the app knew (used when the goal has no account). Default 0. */
  startingCents?: number
  /** null or omitted = the household's average monthly net. */
  monthlyContributionCents?: number | null
  /** Its cleared balance is the saved amount. Must belong to the household. */
  accountId?: number | null
  /** null or omitted = a goal of the household. Must be a member. */
  userId?: number | null
}

/** PATCH semantics: only the given fields change. */
export interface UpdateGoalInput extends Partial<CreateGoalInput> {
  /** `reached` stamps `reachedAt`; back to `active` clears it. */
  status?: GoalStatus
}

export interface GoalFilters {
  status?: GoalStatus
}

/** Where the monthly rate of a projection came from. */
export type GoalRateSource = 'contribution' | 'average' | 'none'

export type GoalProjectionReport = {
  goalId: number
  savedCents: number
  targetCents: number
  rateSource: GoalRateSource
  monthlyRateCents: number | null
} & GoalProjection
