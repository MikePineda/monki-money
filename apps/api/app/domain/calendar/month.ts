import type { DateTime } from 'luxon'

/**
 * Months are calendar months over `transactions.date` ('YYYY-MM-DD'
 * strings, never timestamps). The household time zone only decides what
 * "today" and "this month" are. Nothing here reads the clock: `now` is
 * always passed in.
 */

/** A calendar month, 'YYYY-MM'. */
export type Month = string

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/

export function isMonth(value: string): boolean {
  return MONTH.test(value)
}

function parts(month: Month): [number, number] {
  const match = MONTH.exec(month)
  if (!match) throw new RangeError(`Not a month (YYYY-MM): ${month}`)
  return [Number(match[1]), Number(match[2])]
}

function format(year: number, month: number): Month {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`
}

/** The month a calendar date belongs to: '2026-09-30' -> '2026-09'. */
export function monthOf(date: string): Month {
  return date.slice(0, 7)
}

/** First and last calendar day of the month, inclusive. */
export function monthRange(month: Month): { from: string; to: string } {
  const [year, monthNumber] = parts(month)
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` }
}

/** `month` moved by `delta` months (negative goes back). */
export function addMonths(month: Month, delta: number): Month {
  const [year, monthNumber] = parts(month)
  const index = year * 12 + (monthNumber - 1) + delta
  return format(Math.floor(index / 12), (index % 12) + 1)
}

/** The `count` months that end at `month` (inclusive), oldest first. */
export function previousMonths(month: Month, count: number): Month[] {
  return Array.from({ length: count }, (_, index) => addMonths(month, index - count + 1))
}

/** Today's calendar date in `zone` ('YYYY-MM-DD'). */
export function todayIn(now: DateTime, zone: string): string {
  return now.setZone(zone).toFormat('yyyy-MM-dd')
}

/** The current month in `zone`. */
export function currentMonth(now: DateTime, zone: string): Month {
  return now.setZone(zone).toFormat('yyyy-MM')
}
