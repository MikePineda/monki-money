import type { RecurringCadence } from '@monkimoney/shared'
import { addMonths, monthOf, monthsBetween } from '#domain/calendar/month'
import { addDays, daysBetween, isoDate } from '#domain/importing/iso_days'

/**
 * Calendar of a recurring payment, on 'YYYY-MM-DD' strings (no clock, no
 * time zone). Weekly and fortnightly payments step by days; the others by
 * calendar months, keeping the day of the month of the date they start
 * from and clamping it to short months (Jan 31 -> Feb 28 -> Mar 31).
 */

type Step = { days: number; slackPerStep: number } | { months: number; slackDays: number }

/**
 * One step of each cadence and how far a real payment may land from it:
 * weekly 6-8 days, fortnightly 13-15 days (one day per step); month-based
 * cadences the same day of the month give or take a weekend or a public
 * holiday (3 days), a week for the longer ones.
 */
const STEPS: Record<RecurringCadence, Step> = {
  weekly: { days: 7, slackPerStep: 1 },
  fortnightly: { days: 14, slackPerStep: 1 },
  monthly: { months: 1, slackDays: 3 },
  quarterly: { months: 3, slackDays: 7 },
  yearly: { months: 12, slackDays: 7 },
}

/** A gap of more steps than this (two missed payments in a row) breaks a pattern. */
export const MAX_STEPS_PER_GAP = 2

/**
 * How far (in days) a payment may land from a due date and still pay it:
 * about half a step, so a payment is never closer to the due date before
 * or after. Wider than the detection slack: a bill paid a few days late or
 * early still counts as paid.
 */
export const PAYMENT_WINDOW_DAYS: Record<RecurringCadence, number> = {
  weekly: 3,
  fortnightly: 7,
  monthly: 14,
  quarterly: 30,
  yearly: 60,
}

/** The widest payment window: how far before a month payments are read to pair its first due dates. */
export const MAX_PAYMENT_WINDOW_DAYS = Math.max(...Object.values(PAYMENT_WINDOW_DAYS))

/**
 * `date` moved by `months` calendar months, keeping its day (or `dayOfMonth`
 * when given) clamped to the month's length.
 */
export function addMonthsKeepingDay(date: string, months: number, dayOfMonth?: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const index = year * 12 + (month - 1) + months
  const targetYear = Math.floor(index / 12)
  const targetMonth = (index % 12) + 1
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate()
  return isoDate(targetYear, targetMonth, Math.min(dayOfMonth ?? day, lastDay))
}

/** True for weekly and fortnightly (day steps); false for the month-based cadences. */
export function stepsByDays(cadence: RecurringCadence): boolean {
  return 'days' in STEPS[cadence]
}

/** `date` moved by `steps` steps of `cadence` (negative goes back). */
export function addCadence(date: string, cadence: RecurringCadence, steps = 1): string {
  const step = STEPS[cadence]
  return 'days' in step
    ? addDays(date, step.days * steps)
    : addMonthsKeepingDay(date, step.months * steps)
}

/**
 * How many steps of `cadence` lead from `from` to `to` (1 or 2, see
 * MAX_STEPS_PER_GAP), or null when `to` lands on none of them.
 */
export function stepsBetween(from: string, to: string, cadence: RecurringCadence): number | null {
  const step = STEPS[cadence]
  for (let steps = 1; steps <= MAX_STEPS_PER_GAP; steps++) {
    const slack = 'days' in step ? step.slackPerStep * steps : step.slackDays
    if (Math.abs(daysBetween(addCadence(from, cadence, steps), to)) <= slack) return steps
  }
  return null
}

/** Upper bound of the loops below: more than a century of weekly steps. */
const MAX_ITERATIONS = 6_000

/**
 * The first due date after the payment of `lastDate` that is on or after
 * `today`. Always counted from `lastDate`, so monthly dates never drift.
 */
export function nextDueOnOrAfter(lastDate: string, cadence: RecurringCadence, today: string) {
  for (let steps = 1; steps < MAX_ITERATIONS; steps++) {
    const due = addCadence(lastDate, cadence, steps)
    if (due >= today) return due
  }
  throw new RangeError(`No due date after ${lastDate} reaches ${today}`)
}

/**
 * Every due date between `from` and `to` (inclusive) of a payment due on
 * `anchor`, projected forward and back from it. Month-based cadences fall
 * on `dayOfMonth` when given (a bill due on the 31st whose anchor was
 * clamped to the 30th still falls on Oct 31), else on the anchor's day.
 */
export function dueDatesBetween(
  anchor: string,
  cadence: RecurringCadence,
  from: string,
  to: string,
  dayOfMonth?: number
): string[] {
  const step = STEPS[cadence]
  const dates: string[] = []

  if ('days' in step) {
    const first = Math.ceil(daysBetween(anchor, from) / step.days)
    for (let steps = first; dates.length < MAX_ITERATIONS; steps++) {
      const due = addDays(anchor, steps * step.days)
      if (due > to) break
      dates.push(due)
    }
    return dates
  }

  // Month-based: one candidate per calendar month whose distance from the
  // anchor's month is a whole number of steps.
  let month = monthOf(from)
  for (let guard = 0; guard < MAX_ITERATIONS && month <= monthOf(to); guard++) {
    const distance = monthsBetween(monthOf(anchor), month)
    if (((distance % step.months) + step.months) % step.months === 0) {
      const due = addMonthsKeepingDay(anchor, distance, dayOfMonth)
      if (due >= from && due <= to) dates.push(due)
    }
    month = addMonths(month, 1)
  }
  return dates
}
