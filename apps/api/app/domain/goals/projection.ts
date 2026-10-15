import type { MonthTotals } from '#domain/reports/trends'
import { addMonths, monthOf, monthsBetween, type Month } from '#domain/calendar/month'

/**
 * Savings goal projections. Pure: the saved amount, the monthly rate and the
 * month to project from are passed in; nothing here reads the clock or the
 * database. Integer cents in and out (divisions round up with `Math.ceil`,
 * the average rounds to the nearest cent).
 *
 * Month granularity: point 0 of the projection is `fromMonth` (the current
 * month) with what is saved today, and every following month adds one
 * monthly rate. A goal is "projected" for the first day of the month its
 * running total reaches the target, and a target date counts as its month
 * (`onTrack` = projectedDate <= targetDate).
 */

/** Points of the projection chart, `fromMonth` included. */
export const MAX_SERIES_POINTS = 24

/** Beyond this the goal is open-ended (and the date would not be a real year). */
export const MAX_PROJECTION_MONTHS = 1_200

export type ProjectionPoint = {
  month: Month
  projectedCents: number
}

export type GoalProjection = {
  /** What is still missing, never negative. */
  remainingCents: number
  /** Months of saving still needed (0 once reached); null when open-ended. */
  monthsToGoal: number | null
  /** First day of the month the goal is reached ('YYYY-MM-DD'); null when reached or open-ended. */
  projectedDate: string | null
  /** Monthly amount that reaches the target by its date; null without a date or once it passed. */
  requiredMonthlyForTargetDate: number | null
  /** Projected date <= target date; null without a target date or without a usable rate. */
  onTrack: boolean | null
  /** Running projection from `fromMonth` until reached, at most MAX_SERIES_POINTS points. */
  series: ProjectionPoint[]
}

export type GoalProjectionInput = {
  targetCents: number
  savedCents: number
  /** Saved per month; null (unknown) or <= 0 leaves the goal open-ended. */
  monthlyRateCents: number | null
  /** 'YYYY-MM-DD' */
  targetDate: string | null
  /** The month in progress. */
  fromMonth: Month
}

function hasActivity(totals: MonthTotals) {
  return totals.incomeCents !== 0 || totals.expenseCents !== 0
}

/** Nearest whole cent, never -0. */
function wholeCents(value: number) {
  return Math.round(value) || 0
}

/**
 * Mean net savings (income - expense) of the last `window` full months:
 * `currentMonth` (still in progress) and anything after it never count, nor
 * do the quiet months before the first one with any income or expense
 * (the household had no data yet). Null when no full month is left.
 */
export function averageMonthlyNet(
  history: MonthTotals[],
  currentMonth: Month,
  window = 3
): number | null {
  const full = history
    .filter((totals) => totals.month < currentMonth)
    .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0))
  const firstActive = full.findIndex(hasActivity)
  if (firstActive === -1) return null

  const recent = full.slice(firstActive).slice(-window)
  const total = recent.reduce((sum, totals) => sum + totals.netCents, 0)
  return wholeCents(total / recent.length)
}

export function projectGoal(input: GoalProjectionInput): GoalProjection {
  const { targetCents, savedCents, monthlyRateCents, targetDate, fromMonth } = input
  const remainingCents = Math.max(0, targetCents - savedCents)
  const today = [{ month: fromMonth, projectedCents: savedCents }]

  if (remainingCents === 0) {
    return {
      remainingCents,
      monthsToGoal: 0,
      projectedDate: null,
      requiredMonthlyForTargetDate: targetDate === null ? null : 0,
      onTrack: targetDate === null ? null : true,
      series: today,
    }
  }

  const monthsLeft = targetDate === null ? null : monthsBetween(fromMonth, monthOf(targetDate))
  const pastDue = monthsLeft !== null && monthsLeft < 0
  // Due this month: the whole remainder now.
  const requiredMonthlyForTargetDate =
    monthsLeft === null || pastDue ? null : Math.ceil(remainingCents / Math.max(1, monthsLeft))

  const rate = monthlyRateCents !== null && monthlyRateCents > 0 ? monthlyRateCents : null
  if (rate === null || Math.ceil(remainingCents / rate) > MAX_PROJECTION_MONTHS) {
    return {
      remainingCents,
      monthsToGoal: null,
      projectedDate: null,
      requiredMonthlyForTargetDate,
      onTrack: pastDue ? false : null,
      series: today,
    }
  }

  const monthsToGoal = Math.ceil(remainingCents / rate)
  const projectedDate = `${addMonths(fromMonth, monthsToGoal)}-01`
  return {
    remainingCents,
    monthsToGoal,
    projectedDate,
    requiredMonthlyForTargetDate,
    onTrack: targetDate === null ? null : projectedDate <= targetDate,
    series: Array.from({ length: Math.min(monthsToGoal + 1, MAX_SERIES_POINTS) }, (_, index) => ({
      month: addMonths(fromMonth, index),
      projectedCents: savedCents + index * rate,
    })),
  }
}
