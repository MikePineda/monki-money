import type { Weekday } from '@monkimoney/shared'

/**
 * The daily reminder's weekday picker: ISO weekdays (Monday 1 to Sunday 7),
 * named by Intl in the reader's locale, Monday first.
 */

/** Monday 19 October 2026 (UTC): the first of the seven days that get named. */
const A_MONDAY = Date.UTC(2026, 9, 19)
const DAY_MS = 24 * 60 * 60 * 1000

/** The seven day names, Monday first ('Mon'... or 'lunes'...). */
export function weekdayNames(locale: string, width: 'short' | 'long'): string[] {
  const format = new Intl.DateTimeFormat(locale, { weekday: width, timeZone: 'UTC' })
  return Array.from({ length: 7 }, (_, index) => format.format(A_MONDAY + index * DAY_MS))
}

/**
 * `days` with `day` switched, Monday first. The last chosen day stays: no
 * day at all would mean "no reminder", which is the reminder switch's job.
 */
export function toggleWeekday(days: readonly Weekday[], day: Weekday): Weekday[] {
  if (days.includes(day)) {
    return days.length === 1 ? [...days] : days.filter((chosen) => chosen !== day)
  }
  return [...days, day].sort((a, b) => a - b)
}
