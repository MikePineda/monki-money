import type User from '#models/user'
import Clock from '#services/clock'
import Account from '#models/account'
import Category from '#models/category'
import { inject } from '@adonisjs/core'
import type Household from '#models/household'
import { postingsFor } from '#domain/ledger/privacy'
import { findInHousehold } from '#repositories/scoped'
import { privacyViewer } from '#services/ledger/privacy_viewer'
import { summarizeMonth } from '#domain/reports/month_summary'
import AccountBalances from '#services/accounts/account_balances'
import CommittedReportBuilder from '#services/recurring/committed_report'
import PostingsRepository from '#repositories/postings_repository'
import { assertMemberOf } from '#services/households/membership_lookup'
import {
  breakdownTrend,
  categoryTrend,
  topMovers,
  trend,
  type TrendGroupBy,
} from '#domain/reports/trends'
import {
  addMonths,
  currentMonth,
  monthRange,
  previousMonths,
  todayIn,
  type Month,
} from '#domain/calendar/month'

export interface MonthReportInput {
  /** 'YYYY-MM'; default: the current month in the household's time zone. */
  month?: Month
  /** Only what this member paid. */
  paidByUserId?: number
}

export interface TrendReportInput {
  /** Number of months, ending at `month`. Default 6. */
  months?: number
  /** Last month of the window; default: the current month. */
  month?: Month
  groupBy?: TrendGroupBy
}

/**
 * Reports read postings (app/repositories/postings_repository.ts), mask
 * the partner's private ones for the reader and hand them to the pure
 * functions of app/domain/reports. No report has its own SQL.
 */
@inject()
export default class ReportService {
  constructor(
    protected postings: PostingsRepository,
    protected balancesOfAccounts: AccountBalances,
    protected committedReport: CommittedReportBuilder,
    protected clock: Clock
  ) {}

  /**
   * Where the money went in a month, the categories that moved the most vs
   * the month before, and what the recurring payments commit in it
   * (`committed`: already paid, still due until the end of the month).
   */
  async month(household: Household, viewer: User, input: MonthReportInput = {}) {
    if (input.paidByUserId !== undefined) {
      await assertMemberOf(household, input.paidByUserId, 'paidByUserId')
    }
    const now = this.clock.now()
    const month = input.month ?? currentMonth(now, household.timezone)
    const previous = addMonths(month, -1)
    const reader = await privacyViewer(household, viewer)

    let postings = postingsFor(
      await this.postings.between(household, monthRange(previous).from, monthRange(month).to),
      reader
    )
    if (input.paidByUserId !== undefined) {
      postings = postings.filter((posting) => posting.paidByUserId === input.paidByUserId)
    }

    const summary = summarizeMonth(postings, month)
    const committed = await this.committedReport.forMonth(household, reader, {
      month,
      today: todayIn(now, household.timezone),
      paidByUserId: input.paidByUserId,
    })
    return {
      ...summary,
      topMovers: topMovers(summarizeMonth(postings, previous), summary),
      committed,
    }
  }

  /** Income/expense/net per month and one series per group (or category). */
  async trend(household: Household, viewer: User, input: TrendReportInput = {}) {
    const months = previousMonths(input.month ?? this.currentMonth(household), input.months ?? 6)
    const groupBy = input.groupBy ?? 'group'
    const postings = await this.window(household, viewer, months)

    return {
      months,
      groupBy,
      totals: trend(postings, months),
      series: breakdownTrend(postings, months, groupBy),
    }
  }

  /** Monthly amounts of one category (404 for another household's category). */
  async category(
    household: Household,
    viewer: User,
    categoryId: number,
    input: Pick<TrendReportInput, 'months' | 'month'> = {}
  ) {
    const category = await findInHousehold(Category, household, categoryId)
    await category.load('group')
    const months = previousMonths(input.month ?? this.currentMonth(household), input.months ?? 6)
    const postings = await this.window(household, viewer, months)

    return {
      months,
      ...categoryTrend(postings, { id: category.id, kind: category.group.kind }, months),
    }
  }

  /**
   * Cleared and available balance per account, plus the household totals
   * per currency (amounts in different currencies are never added up).
   */
  async balances(household: Household) {
    const accounts = await Account.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .orderBy('sort_order')
      .orderBy('id')
    const balances = await this.balancesOfAccounts.forAccounts(accounts)

    const rows = accounts.map((account) => ({
      accountId: account.id,
      currencyCode: account.currencyCode,
      isActive: account.isActive,
      clearedBalanceCents: balances.get(account.id)?.clearedBalanceCents ?? 0,
      availableBalanceCents: balances.get(account.id)?.availableBalanceCents ?? 0,
    }))

    const totals: Record<string, { clearedBalanceCents: number; availableBalanceCents: number }> =
      {}
    for (const row of rows) {
      const total = (totals[row.currencyCode] ??= {
        clearedBalanceCents: 0,
        availableBalanceCents: 0,
      })
      total.clearedBalanceCents += row.clearedBalanceCents
      total.availableBalanceCents += row.availableBalanceCents
    }
    return { accounts: rows, totals }
  }

  protected currentMonth(household: Household) {
    return currentMonth(this.clock.now(), household.timezone)
  }

  protected async window(household: Household, viewer: User, months: Month[]) {
    const from = monthRange(months[0]).from
    const to = monthRange(months[months.length - 1]).to
    return postingsFor(
      await this.postings.between(household, from, to),
      await privacyViewer(household, viewer)
    )
  }
}
