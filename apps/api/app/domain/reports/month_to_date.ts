import type { Posting } from '#domain/ledger/posting'
import { addMonths, monthOf, monthRange, type Month } from '#domain/calendar/month'
import { summarizePostings, type GroupLine } from '#domain/reports/month_summary'

/**
 * Like-with-like comparisons for the month still running. Halfway through
 * October, "October so far" against the whole of September always reads as
 * spending far less, so the running month is compared with the same days
 * (1 → today's day of the month, capped at each month's length) of the
 * months before it. Closed months keep their full-month comparisons.
 *
 * Pure: `today` ('YYYY-MM-DD' in the household time zone) is passed in and
 * the totals follow the month summary's rules (summarizePostings).
 */

/** Months before the running one that make up the Month view's "3-month average". */
export const AVERAGE_MONTHS = 3

/** Totals of a month over its first `throughDay` days. */
export type ToDateTotals = {
  /** Last day counted (today's day of the month, capped at that month's length). */
  throughDay: number
  incomeCents: number
  expenseCents: number
  netCents: number
}

/** Spending of one earlier month over the same days, with its groups. */
export type MonthToDate = {
  month: Month
  throughDay: number
  expenseCents: number
  byGroup: GroupLine[]
}

/** Today's day of the month when `month` is the one running today; null for any other month. */
export function dayReached(month: Month, today: string): number | null {
  return monthOf(today) === month ? Number(today.slice(8, 10)) : null
}

/** `month` from its first day to `day`, capped at its last day. */
export function sameDaysOf(
  month: Month,
  day: number
): { from: string; to: string; throughDay: number } {
  const { from, to } = monthRange(month)
  const throughDay = Math.min(day, Number(to.slice(8, 10)))
  return { from, to: `${month}-${String(throughDay).padStart(2, '0')}`, throughDay }
}

function summarizeSameDays(postings: Posting[], month: Month, day: number) {
  const window = sameDaysOf(month, day)
  const counted = postings.filter(
    (posting) => posting.date >= window.from && posting.date <= window.to
  )
  return { throughDay: window.throughDay, ...summarizePostings(counted) }
}

/**
 * The previous month over the days the running `month` has had so far
 * (the Month view's hero delta); null when `month` is not running today.
 */
export function previousToDate(
  postings: Posting[],
  month: Month,
  today: string
): ToDateTotals | null {
  const day = dayReached(month, today)
  if (day === null) {
    return null
  }
  const { throughDay, incomeCents, expenseCents, netCents } = summarizeSameDays(
    postings,
    addMonths(month, -1),
    day
  )
  return { throughDay, incomeCents, expenseCents, netCents }
}

/**
 * The `count` months before the running `month`, oldest first, each over
 * the same days (the base of the Month view's "3-month average" cards);
 * null when `month` is not running today.
 */
export function previousMonthsToDate(
  postings: Posting[],
  month: Month,
  today: string,
  count = AVERAGE_MONTHS
): MonthToDate[] | null {
  const day = dayReached(month, today)
  if (day === null) {
    return null
  }
  return Array.from({ length: count }, (_, index) => {
    const earlier = addMonths(month, index - count)
    const { throughDay, expenseCents, byGroup } = summarizeSameDays(postings, earlier, day)
    return { month: earlier, throughDay, expenseCents, byGroup }
  })
}
