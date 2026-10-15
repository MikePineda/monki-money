/**
 * Calendar-day arithmetic on `YYYY-MM-DD` strings. Works in UTC on purpose:
 * these are dates, not instants, so no timezone can shift them.
 */

const DAY_MS = 86_400_000

/** `YYYY-MM-DD` from numeric parts (no validation). */
export function isoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** True when the day exists in that month (leap years included). */
export function isValidDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false
  if (month < 1 || month > 12 || day < 1) return false
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function toEpochDay(date: string): number {
  const [year, month, day] = date.split('-').map(Number)
  return Date.UTC(year, month - 1, day) / DAY_MS
}

/** `date` moved by `days` (negative goes back). */
export function addDays(date: string, days: number): string {
  const moved = new Date((toEpochDay(date) + days) * DAY_MS)
  return isoDate(moved.getUTCFullYear(), moved.getUTCMonth() + 1, moved.getUTCDate())
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return toEpochDay(to) - toEpochDay(from)
}
