import type User from '#models/user'
import Clock from '#services/clock'
import Account from '#models/account'
import Category from '#models/category'
import { inject } from '@adonisjs/core'
import type Household from '#models/household'
import Transaction from '#models/transaction'
import type { Locale } from '@monkimoney/shared'
import { postingsFor } from '#domain/ledger/privacy'
import { isoTimestamp } from '#domain/time/iso_timestamp'
import { storedInsight } from '#services/insights/insight_service'
import { largestExpenses, type LargestExpense } from '#domain/reports/top_expenses'
import { findInHousehold } from '#repositories/scoped'
import { privacyViewer } from '#services/ledger/privacy_viewer'
import { summarizeMonth } from '#domain/reports/month_summary'
import {
  AVERAGE_MONTHS,
  dayReached,
  previousMonthsToDate,
  previousToDate,
} from '#domain/reports/month_to_date'
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
  /** The reader's language: `insight` says whether their summary is stored. Default: the household's. */
  locale?: Locale
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
 * functions of app/domain/reports. No report has its own SQL (the month's
 * largest expenses, picked from postings, only read their payee and notes
 * by id).
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
   * Where the money went in a month, the previous month's totals (same
   * rules and payer filter), the categories that moved the most vs the
   * month before, its five largest expenses, whether the reader's monthly
   * summary is stored (`insight`), and what the recurring payments commit
   * in it (`committed`: already paid, still due until the end of the
   * month). For the month running today it also carries the earlier
   * months over the same days (`previousToDate`, `previousMonthsToDate`,
   * app/domain/reports/month_to_date.ts), so "so far" is never compared
   * with whole months. One call draws the Month view but its 6-month trend.
   */
  async month(household: Household, viewer: User, input: MonthReportInput = {}) {
    if (input.paidByUserId !== undefined) {
      await assertMemberOf(household, input.paidByUserId, 'paidByUserId')
    }
    const now = this.clock.now()
    const today = todayIn(now, household.timezone)
    const month = input.month ?? currentMonth(now, household.timezone)
    const previous = addMonths(month, -1)
    // The running month also reads the months its "3-month average" compares with.
    const first = dayReached(month, today) === null ? previous : addMonths(month, -AVERAGE_MONTHS)
    const reader = await privacyViewer(household, viewer)

    let postings = postingsFor(
      await this.postings.between(household, monthRange(first).from, monthRange(month).to),
      reader
    )
    if (input.paidByUserId !== undefined) {
      postings = postings.filter((posting) => posting.paidByUserId === input.paidByUserId)
    }

    const summary = summarizeMonth(postings, month)
    const before = summarizeMonth(postings, previous)
    const locale = input.locale ?? household.locale
    const [committed, topExpenses, insight] = await Promise.all([
      this.committedReport.forMonth(household, reader, {
        month,
        today,
        paidByUserId: input.paidByUserId,
      }),
      this.describe(household, largestExpenses(postings, month)),
      storedInsight(household, month, locale).select('generated_at').first(),
    ])
    return {
      ...summary,
      previous: {
        incomeCents: before.incomeCents,
        expenseCents: before.expenseCents,
        netCents: before.netCents,
      },
      previousToDate: previousToDate(postings, month, today),
      previousMonthsToDate: previousMonthsToDate(postings, month, today),
      topMovers: topMovers(before, summary),
      topExpenses,
      // The language the flag is about, so a client that switched language can tell.
      insight: {
        available: insight !== null,
        generatedAt: isoTimestamp(insight?.generatedAt ?? null),
        locale,
      },
      committed,
    }
  }

  /**
   * The month's largest expenses with their payee and notes, masked like
   * the transaction resource when the reader may not see them.
   */
  protected async describe(household: Household, expenses: LargestExpense[]) {
    const ids = expenses.map((expense) => expense.transactionId)
    const rows = ids.length
      ? await Transaction.query()
          .withScopes((scopes) => scopes.forHousehold(household))
          .whereIn('id', ids)
          .select('id', 'payee', 'description')
      : []
    const text = new Map(rows.map((row) => [row.id, row]))
    return expenses.map((expense) => {
      const row = expense.hidden ? undefined : text.get(expense.transactionId)
      return {
        id: expense.transactionId,
        date: expense.date,
        payee: row?.payee ?? null,
        description: row?.description ?? null,
        amountCents: expense.amountCents,
        categoryId: expense.categoryId,
        isSplit: expense.isSplit,
        paidByUserId: expense.paidByUserId,
        isMasked: expense.hidden,
      }
    })
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
