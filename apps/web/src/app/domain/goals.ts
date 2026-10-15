/**
 * Savings goals on the client: the form's draft and the API body it
 * becomes, and how a projection reads (progress, reached / projected /
 * open-ended, on track or behind, why it is open-ended). Pure: no Angular,
 * and the wire shapes are restated structurally so domain stays free of
 * core.
 */

export type GoalStatus = 'active' | 'reached' | 'archived'
/** Whose goal it is: the household's (no user), yours or your partner's. */
export type GoalOwner = 'household' | 'you' | 'partner'
/** Where the saved amount comes from: typed once, or an account's cleared balance. */
export type SavedFrom = 'manual' | 'account'
/** `estimate`: the API averages the last full months; `fixed`: a monthly amount. */
export type ContributionMode = 'estimate' | 'fixed'
export type RateSource = 'contribution' | 'average' | 'none'

/** What the goal form edits. Amounts are integer cents. */
export interface GoalDraft {
  name: string
  targetCents: number
  /** 'YYYY-MM-DD', or '' for no target date. */
  targetDate: string
  savedFrom: SavedFrom
  startingCents: number
  accountId: number | null
  contribution: ContributionMode
  monthlyContributionCents: number
  owner: GoalOwner
}

/** The goal fields the form reads and writes (`POST /goals`, `PATCH /goals/:id`). */
export interface GoalFields {
  name: string
  targetCents: number
  targetDate: string | null
  startingCents: number
  /** null = let the API estimate the rate. */
  monthlyContributionCents: number | null
  accountId: number | null
  /** null = a goal of the household. */
  userId: number | null
}

/** The two members as user ids (null in a household of one). */
export interface GoalPeople {
  youId: number | null
  partnerId: number | null
}

/** The parts of `GET /goals/:id/projection` the screens read. */
export interface ProjectionFacts {
  savedCents: number
  targetCents: number
  remainingCents: number
  rateSource: RateSource
  monthlyRateCents: number | null
  monthsToGoal: number | null
  projectedDate: string | null
  requiredMonthlyForTargetDate: number | null
  onTrack: boolean | null
  series: readonly { month: string; projectedCents: number }[]
}

export type GoalOutlook = 'reached' | 'projected' | 'openEnded'
export type TargetPace = 'onTrack' | 'behind'
export type OpenEndedReason = 'noHistory' | 'spendingMore' | 'zeroContribution' | 'tooSlow'
export type DraftProblem = 'name' | 'targetCents' | 'accountId'

export const EMPTY_GOAL_DRAFT: GoalDraft = {
  name: '',
  targetCents: 0,
  targetDate: '',
  savedFrom: 'manual',
  startingCents: 0,
  accountId: null,
  contribution: 'estimate',
  monthlyContributionCents: 0,
  owner: 'household',
}

/** A member who left the household reads as the household's goal. */
export function ownerOf(userId: number | null, people: GoalPeople): GoalOwner {
  if (userId !== null && userId === people.youId) {
    return 'you'
  }
  if (userId !== null && userId === people.partnerId) {
    return 'partner'
  }
  return 'household'
}

export function draftFromGoal(goal: GoalFields, people: GoalPeople): GoalDraft {
  return {
    name: goal.name,
    targetCents: goal.targetCents,
    targetDate: goal.targetDate ?? '',
    savedFrom: goal.accountId === null ? 'manual' : 'account',
    startingCents: goal.startingCents,
    accountId: goal.accountId,
    contribution: goal.monthlyContributionCents === null ? 'estimate' : 'fixed',
    monthlyContributionCents: goal.monthlyContributionCents ?? 0,
    owner: ownerOf(goal.userId, people),
  }
}

/** The API body for a draft (the whole goal, so create and edit share it). */
export function goalPayload(draft: GoalDraft, people: GoalPeople): GoalFields {
  const userIds: Record<GoalOwner, number | null> = {
    household: null,
    you: people.youId,
    partner: people.partnerId,
  }
  return {
    name: draft.name.trim(),
    targetCents: draft.targetCents,
    targetDate: draft.targetDate || null,
    startingCents: draft.startingCents,
    monthlyContributionCents:
      draft.contribution === 'fixed' ? draft.monthlyContributionCents : null,
    accountId: draft.savedFrom === 'account' ? draft.accountId : null,
    userId: userIds[draft.owner],
  }
}

/** Fields that still block saving: a name, a target above zero, the tracked account. */
export function draftProblems(draft: GoalDraft): DraftProblem[] {
  const problems: DraftProblem[] = []
  if (draft.name.trim() === '') {
    problems.push('name')
  }
  if (draft.targetCents <= 0) {
    problems.push('targetCents')
  }
  if (draft.savedFrom === 'account' && draft.accountId === null) {
    problems.push('accountId')
  }
  return problems
}

/** Saved over target, between 0 and 1. */
export function progressOf(savedCents: number, targetCents: number): number {
  if (targetCents <= 0) {
    return 0
  }
  return Math.min(Math.max(savedCents / targetCents, 0), 1)
}

export function goalOutlook(projection: ProjectionFacts): GoalOutlook {
  if (projection.remainingCents === 0) {
    return 'reached'
  }
  return projection.monthsToGoal === null ? 'openEnded' : 'projected'
}

/** On track or behind the target date; null without a target date (or a usable rate). */
export function targetPace(projection: ProjectionFacts): TargetPace | null {
  if (projection.onTrack === null) {
    return null
  }
  return projection.onTrack ? 'onTrack' : 'behind'
}

/** Why an open-ended goal has no date, so the screen can be honest about it. */
export function openEndedReason(projection: ProjectionFacts): OpenEndedReason {
  if (projection.rateSource === 'none' || projection.monthlyRateCents === null) {
    return 'noHistory'
  }
  if (projection.monthlyRateCents > 0) {
    return 'tooSlow'
  }
  return projection.rateSource === 'contribution' ? 'zeroContribution' : 'spendingMore'
}

export interface ProjectionPoint {
  /** 'YYYY-MM'. */
  x: string
  valueCents: number
}

/** The projection chart's input: point 0 is today's saved amount, the rest are estimates. */
export function projectionPoints(series: ProjectionFacts['series']): {
  history: ProjectionPoint[]
  projection: ProjectionPoint[]
} {
  const points = series.map((point) => ({ x: point.month, valueCents: point.projectedCents }))
  return { history: points.slice(0, 1), projection: points.slice(1) }
}
