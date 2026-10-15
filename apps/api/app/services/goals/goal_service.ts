import type { DateTime } from 'luxon'
import type User from '#models/user'
import Clock from '#services/clock'
import Account from '#models/account'
import { inject } from '@adonisjs/core'
import type Household from '#models/household'
import SavingsGoal from '#models/savings_goal'
import { trend } from '#domain/reports/trends'
import { findInHousehold } from '#repositories/scoped'
import { nextSortOrder, reorder } from '#services/sort_order'
import AccountBalances from '#services/accounts/account_balances'
import PostingsRepository from '#repositories/postings_repository'
import LedgerReferences from '#services/ledger/ledger_references'
import { assertMemberOf } from '#services/households/membership_lookup'
import { averageMonthlyNet, projectGoal } from '#domain/goals/projection'
import { currentMonth, monthRange, previousMonths, type Month } from '#domain/calendar/month'
import type {
  CreateGoalInput,
  GoalFilters,
  GoalProjectionReport,
  GoalRateSource,
  UpdateGoalInput,
} from '#services/goals/dto'

/** Full months averaged when a goal has no explicit monthly contribution. */
const AVERAGE_WINDOW = 3

/**
 * Savings goals of the current household. Lookups are household-scoped
 * (another household's id = 404) and ids in the body must belong to the
 * household (422). Reads, the projection included, never change a goal:
 * reaching the target is a person's call (`status: 'reached'`).
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

  /**
   * Where the goal stands and when it is reached at the current pace:
   * saved = the account's cleared balance (else `startingCents`); rate = the
   * explicit monthly contribution, else the average net of the last full
   * months (a negative average leaves the goal open-ended), else none.
   */
  async projection(
    household: Household,
    goalId: number,
    now: DateTime = this.clock.now()
  ): Promise<GoalProjectionReport> {
    const goal = await findInHousehold(SavingsGoal, household, goalId)
    const fromMonth = currentMonth(now, household.timezone)
    const savedCents = await this.savedCents(household, goal)
    const { rateSource, monthlyRateCents } = await this.monthlyRate(household, goal, fromMonth)

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
    }
  }

  protected async savedCents(household: Household, goal: SavingsGoal) {
    if (goal.accountId === null) return goal.startingCents
    const account = await findInHousehold(Account, household, goal.accountId)
    const balances = await this.balances.forAccounts([account])
    return balances.get(account.id)?.clearedBalanceCents ?? 0
  }

  protected async monthlyRate(
    household: Household,
    goal: SavingsGoal,
    month: Month
  ): Promise<{ rateSource: GoalRateSource; monthlyRateCents: number | null }> {
    if (goal.monthlyContributionCents !== null) {
      return { rateSource: 'contribution', monthlyRateCents: goal.monthlyContributionCents }
    }

    // The full months plus the current one, which the average leaves out.
    // Totals never depend on who reads them, so no privacy view is needed.
    const months = previousMonths(month, AVERAGE_WINDOW + 1)
    const postings = await this.postings.between(
      household,
      monthRange(months[0]).from,
      monthRange(month).to
    )
    const average = averageMonthlyNet(trend(postings, months), month, AVERAGE_WINDOW)
    return average === null
      ? { rateSource: 'none', monthlyRateCents: null }
      : { rateSource: 'average', monthlyRateCents: average }
  }

  protected async assertReferences(household: Household, input: UpdateGoalInput) {
    if (input.accountId) await this.references.account(household, input.accountId)
    if (input.userId) await assertMemberOf(household, input.userId, 'userId')
  }
}
