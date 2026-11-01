import type { TransactionStatus } from '@monkimoney/shared'
import { balanceAt } from '#domain/ledger/balances'
import { monthRange, previousMonths, type Month } from '#domain/calendar/month'

/**
 * What a goal's saved amount was month by month: the solid "actual" line of
 * the projection chart. Pure: the account, its postings and the current
 * month are passed in; nothing here reads the clock or the database.
 *
 * A goal that tracks an account gets that account's cleared balance at the
 * end of each of the last HISTORY_FULL_MONTHS full months and of the
 * current month, the same rule as the saved amount (opening balance plus
 * the settled rows; with an opening balance date, only rows after it).
 * A goal without an account adds what its members logged on it (the
 * contributions, signed) to its starting amount, month end by month end,
 * from the month it started.
 */

/** Full months before the current one that the history shows. */
export const HISTORY_FULL_MONTHS = 6

export type HistoryPoint = {
  month: Month
  balanceCents: number
}

/** The account's opening balance, as of the end of `openingBalanceDate` when set. */
export type HistoryAccount = {
  openingBalanceCents: number
  /** 'YYYY-MM-DD' or null (every row counts). */
  openingBalanceDate: string | null
}

/** One posting of that account: only its date, amount and status matter here. */
export type HistoryEntry = {
  /** 'YYYY-MM-DD' */
  date: string
  amountCents: number
  status: TransactionStatus
}

/**
 * Month-end cleared balances of one account, oldest first, `currentMonth`
 * last. Months that end before the opening balance date are left out: the
 * ledger cannot tell what the account held then.
 */
export function accountHistory(
  account: HistoryAccount,
  entries: readonly HistoryEntry[],
  currentMonth: Month,
  fullMonths = HISTORY_FULL_MONTHS
): HistoryPoint[] {
  const opening = account.openingBalanceDate
  const counted = entries.filter(
    (entry) => entry.status === 'cleared' && (opening === null || entry.date > opening)
  )

  return previousMonths(currentMonth, fullMonths + 1)
    .map((month) => ({ month, end: monthRange(month).to }))
    .filter(({ end }) => opening === null || end >= opening)
    .map(({ month, end }) => ({
      month,
      balanceCents: balanceAt(account.openingBalanceCents, counted, end),
    }))
}

/** One contribution logged on a goal without an account (a withdrawal is negative). */
export type ContributionEntry = {
  /** 'YYYY-MM-DD' */
  date: string
  amountCents: number
}

/** What a goal without an account started from. */
export type ContributionGoal = {
  /** Saved before the app knew: part of every month end the history shows. */
  startingCents: number
  /** 'YYYY-MM-DD': the goal's first day (its creation, or an earlier contribution's date). */
  since: string
}

/**
 * Month-end saved amounts of a goal without an account, oldest first,
 * `currentMonth` last: the starting amount plus the contributions dated up
 * to each month end. Months that end before `since` are left out (the goal
 * did not exist); the current month is always there, today's saved amount.
 */
export function contributionHistory(
  goal: ContributionGoal,
  contributions: readonly ContributionEntry[],
  currentMonth: Month,
  fullMonths = HISTORY_FULL_MONTHS
): HistoryPoint[] {
  return previousMonths(currentMonth, fullMonths + 1)
    .map((month) => ({ month, end: monthRange(month).to }))
    .filter(({ month, end }) => end >= goal.since || month === currentMonth)
    .map(({ month, end }) => ({
      month,
      balanceCents: balanceAt(goal.startingCents, [...contributions], end),
    }))
}
