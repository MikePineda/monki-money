import type { DateTime } from 'luxon'
import type User from '#models/user'
import Clock from '#services/clock'
import Account from '#models/account'
import { inject } from '@adonisjs/core'
import type Household from '#models/household'
import SavingsGoal from '#models/savings_goal'
import { trend } from '#domain/reports/trends'
import { FieldError } from '#exceptions/field_error'
import { GoalTracksAccount } from '#exceptions/errors'
import GoalContribution from '#models/goal_contribution'
import { findInHousehold } from '#repositories/scoped'
import { nextSortOrder, reorder } from '#services/sort_order'
import AccountBalances from '#services/accounts/account_balances'
import PostingsRepository from '#repositories/postings_repository'
import LedgerReferences from '#services/ledger/ledger_references'
import { assertMemberOf } from '#services/households/membership_lookup'
import { averageMonthlyNet, projectGoal } from '#domain/goals/projection'
import { accountHistory, contributionHistory, type HistoryPoint } from '#domain/goals/history'
import {
  currentMonth,
  monthRange,
  previousMonths,
  todayIn,
  type Month,
} from '#domain/calendar/month'
import type {
  CreateContributionInput,
  CreateGoalInput,
  GoalFilters,
  GoalProjectionReport,
  GoalRateSource,
  UpdateGoalInput,
} from '#services/goals/dto'

/** Full months averaged when a goal has no explicit monthly contribution. */
const AVERAGE_WINDOW = 3

/**
 * What a projection needs of where a goal's money is (a tracked account, or
 * the contributions of a goal without one): today's saved amount and its
 * month ends.
 */
type SavedSource = {
  savedCents: number
  history: HistoryPoint[]
}

/**
 * Savings goals of the current household. Lookups are household-scoped
 * (another household's id = 404) and ids in the body must belong to the
 * household (422). Reads, the projection included, never change a goal:
 * reaching the target is a person's call (`status: 'reached'`). A goal
 * without an account saves through its contributions (signed entries
 * members log on it); a goal with one, through that account.
 */
@inject()
export default class GoalService {
  constructor(
    protected references: LedgerReferences,
    protected balances: AccountBalances,
    protected postings: PostingsRepository,
    protected clock: Clock
  ) {}

  async list(household: Household, filters: GoalFilters = {}) {
    const query = SavingsGoal.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .orderBy('sort_order')
      .orderBy('id')
    if (filters.status) query.where('status', filters.status)
    return query
  }

  find(household: Household, goalId: number) {
    return findInHousehold(SavingsGoal, household, goalId)
  }

  async create(household: Household, creator: User, input: CreateGoalInput) {
    await this.assertReferences(household, input)

    return SavingsGoal.create({
      householdId: household.id,
      name: input.name,
      targetCents: input.targetCents,
      targetDate: input.targetDate ?? null,
      startingCents: input.startingCents ?? 0,
      monthlyContributionCents: input.monthlyContributionCents ?? null,
      accountId: input.accountId ?? null,
      userId: input.userId ?? null,
      status: 'active',
      reachedAt: null,
      sortOrder: await nextSortOrder('savings_goals', { household_id: household.id }),
      createdByUserId: creator.id,
    })
  }

  async update(household: Household, goalId: number, input: UpdateGoalInput) {
    const goal = await findInHousehold(SavingsGoal, household, goalId)
    await this.assertReferences(household, input)

    const { status, ...fields } = input
    goal.merge(
      Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined))
    )
    if (status === 'reached') goal.reachedAt = goal.reachedAt ?? this.clock.now()
    if (status === 'active') goal.reachedAt = null
    if (status) goal.status = status

    await goal.save()
    return goal
  }

  async destroy(household: Household, goalId: number) {
    const goal = await findInHousehold(SavingsGoal, household, goalId)
    await goal.delete()
  }

  async reorder(household: Household, ids: number[]) {
    await reorder(SavingsGoal, household, ids)
  }

  /** The goal's contributions, newest first (by day, then as logged). */
  async contributions(household: Household, goalId: number) {
    const goal = await findInHousehold(SavingsGoal, household, goalId)
    return GoalContribution.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .where('goal_id', goal.id)
      .orderBy('date', 'desc')
      .orderBy('id', 'desc')
  }

  /**
   * Logs money put into (or taken out of) a goal without an account. A goal
   * that tracks an account answers 409 `E_GOAL_TRACKS_ACCOUNT`; a day after
   * today (household time zone) answers 422 `date`/`future`.
   */
  async contribute(
    household: Household,
    member: User,
    goalId: number,
    input: CreateContributionInput
  ) {
    const goal = await findInHousehold(SavingsGoal, household, goalId)
    if (goal.accountId !== null) throw new GoalTracksAccount()
    if (input.date > todayIn(this.clock.now(), household.timezone)) {
      throw new FieldError('date', 'future')
    }

    return GoalContribution.create({
      householdId: household.id,
      goalId: goal.id,
      userId: member.id,
      amountCents: input.amountCents,
      date: input.date,
      memo: input.memo || null,
    })
  }

  /** Deletes one contribution of the goal (another goal's id = 404). */
  async removeContribution(household: Household, goalId: number, contributionId: number) {
    const goal = await findInHousehold(SavingsGoal, household, goalId)
    const contribution = await GoalContribution.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .where('goal_id', goal.id)
      .where('id', contributionId)
      .firstOrFail()
    await contribution.delete()
  }

  /**
   * What each goal has saved today, by goal id, without the projection's
   * history or rate: the tracked account's cleared balance, else the
   * starting amount plus the contributions. One query for the accounts,
   * one for their balances and one for the contributions' sums.
   */
  async savedAmounts(household: Household, goals: SavingsGoal[]): Promise<Map<number, number>> {
    const accountIds = [...new Set(goals.flatMap((goal) => goal.accountId ?? []))]
    const accounts =
      accountIds.length === 0
        ? []
        : await Account.query()
            .withScopes((scopes) => scopes.forHousehold(household))
            .whereIn('id', accountIds)
    const balances = await this.balances.forAccounts(accounts)

    const manualIds = goals.filter((goal) => goal.accountId === null).map((goal) => goal.id)
    const sums: Array<{ goal_id: number; total: string | number }> =
      manualIds.length === 0
        ? []
        : await GoalContribution.query()
            .withScopes((scopes) => scopes.forHousehold(household))
            .whereIn('goal_id', manualIds)
            .groupBy('goal_id')
            .select('goal_id')
            .sum('amount_cents as total')
            .pojo()
    const contributed = new Map(sums.map((row) => [row.goal_id, Number(row.total)]))

    return new Map(
      goals.map((goal) => [
        goal.id,
        goal.accountId === null
          ? goal.startingCents + (contributed.get(goal.id) ?? 0)
          : (balances.get(goal.accountId)?.clearedBalanceCents ?? 0),
      ])
    )
  }

  /**
   * Where the goal stands and when it is reached at the current pace:
   * saved = the account's cleared balance (else `startingCents` plus the
   * contributions); rate = the explicit monthly contribution, else the
   * average net of the last full months (a negative average leaves the goal
   * open-ended), else none; history = the account's month-end cleared
   * balances (else the starting amount plus the contributions up to each
   * month end, from the goal's start).
   */
  async projection(
    household: Household,
    goalId: number,
    now: DateTime = this.clock.now()
  ): Promise<GoalProjectionReport> {
    const goal = await findInHousehold(SavingsGoal, household, goalId)
    const projections = await this.projections(household, [goal], now)
    return projections.get(goal.id)!
  }

  /**
   * The projection of every goal given, by goal id, in one pass: the
   * tracked accounts, their balances and postings, the contributions and
   * the household's average net are each read once, however many goals
   * there are.
   */
  async projections(
    household: Household,
    goals: SavingsGoal[],
    now: DateTime = this.clock.now()
  ): Promise<Map<number, GoalProjectionReport>> {
    if (goals.length === 0) return new Map()

    const fromMonth = currentMonth(now, household.timezone)
    const tracked = await this.trackedAccounts(household, goals, fromMonth)
    const manual = await this.contributed(household, goals, fromMonth)
    const needsAverage = goals.some((goal) => goal.monthlyContributionCents === null)
    const average = needsAverage ? await this.averageNet(household, fromMonth) : null

    return new Map(
      goals.map((goal) => {
        const source = goal.accountId === null ? manual.get(goal.id) : tracked.get(goal.accountId)
        return [goal.id, this.project(goal, source, average, fromMonth)]
      })
    )
  }

  protected project(
    goal: SavingsGoal,
    source: SavedSource | undefined,
    average: number | null,
    fromMonth: Month
  ): GoalProjectionReport {
    const savedCents = source?.savedCents ?? 0
    const { rateSource, monthlyRateCents } = this.monthlyRate(goal, average)

    return {
      goalId: goal.id,
      savedCents,
      targetCents: goal.targetCents,
      rateSource,
      monthlyRateCents,
      ...projectGoal({
        targetCents: goal.targetCents,
        savedCents,
        monthlyRateCents,
        targetDate: goal.targetDate,
        fromMonth,
      }),
      history: source?.history ?? [{ month: fromMonth, balanceCents: savedCents }],
    }
  }

  /**
   * The goals without an account and their contributions, read together
   * (one query, folded in memory): the starting amount plus every
   * contribution, and the month ends since the goal started.
   */
  protected async contributed(
    household: Household,
    goals: SavingsGoal[],
    month: Month
  ): Promise<Map<number, SavedSource>> {
    const manual = goals.filter((goal) => goal.accountId === null)
    if (manual.length === 0) return new Map()

    const rows = await GoalContribution.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .whereIn(
        'goal_id',
        manual.map((goal) => goal.id)
      )
      .select('goal_id', 'date', 'amount_cents')

    return new Map(
      manual.map((goal) => {
        const entries = rows.filter((row) => row.goalId === goal.id)
        const created = goal.createdAt.setZone(household.timezone).toFormat('yyyy-MM-dd')
        const since = entries.reduce((first, row) => (row.date < first ? row.date : first), created)
        const savedCents = entries.reduce((sum, row) => sum + row.amountCents, goal.startingCents)
        return [
          goal.id,
          {
            savedCents,
            history: contributionHistory(
              { startingCents: goal.startingCents, since },
              entries,
              month
            ),
          },
        ]
      })
    )
  }

  /**
   * The accounts the goals track, read together: one query for the
   * accounts, one for their balances and one for their postings up to the
   * end of the current month (the month ends are folded in memory).
   */
  protected async trackedAccounts(
    household: Household,
    goals: SavingsGoal[],
    month: Month
  ): Promise<Map<number, SavedSource>> {
    const ids = [...new Set(goals.flatMap((goal) => goal.accountId ?? []))]
    if (ids.length === 0) return new Map()

    const accounts = await Account.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .whereIn('id', ids)
    const balances = await this.balances.forAccounts(accounts)
    const postings = await this.postings.upTo(household, monthRange(month).to, {
      accountIds: accounts.map((account) => account.id),
    })

    return new Map(
      accounts.map((account) => [
        account.id,
        {
          savedCents: balances.get(account.id)?.clearedBalanceCents ?? 0,
          history: accountHistory(
            account,
            postings.filter((posting) => posting.accountId === account.id),
            month
          ),
        },
      ])
    )
  }

  protected monthlyRate(
    goal: SavingsGoal,
    average: number | null
  ): { rateSource: GoalRateSource; monthlyRateCents: number | null } {
    if (goal.monthlyContributionCents !== null) {
      return { rateSource: 'contribution', monthlyRateCents: goal.monthlyContributionCents }
    }
    return average === null
      ? { rateSource: 'none', monthlyRateCents: null }
      : { rateSource: 'average', monthlyRateCents: average }
  }

  /**
   * The household's average net of the last full months. The full months
   * plus the current one are read (the average leaves the current one out).
   * Totals never depend on who reads them, so no privacy view is needed.
   */
  protected async averageNet(household: Household, month: Month): Promise<number | null> {
    const months = previousMonths(month, AVERAGE_WINDOW + 1)
    const postings = await this.postings.between(
      household,
      monthRange(months[0]).from,
      monthRange(month).to
    )
    return averageMonthlyNet(trend(postings, months), month, AVERAGE_WINDOW)
  }

  protected async assertReferences(household: Household, input: UpdateGoalInput) {
    if (input.accountId) await this.references.account(household, input.accountId)
    if (input.userId) await assertMemberOf(household, input.userId, 'userId')
  }
}
