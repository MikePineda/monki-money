/**
 * Calendar days for display. Pure: no Angular. Day-first in both locales
 * (DESIGN.md, Voice): "14 Nov 2026" / "14 nov 2026".
 */
export function formatDay(isoTimestamp: string, locale: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone,
  }).formatToParts(new Date(isoTimestamp))
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? ''
  // Some locales add a dot or "de" to short months; keep the plain form.
  const month = part('month').replace(/\.$/, '')
  return `${part('day')} ${month} ${part('year')}`
}

function calendarParts(date: string, locale: string, weekday: boolean) {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const parts = new Intl.DateTimeFormat(locale, {
    weekday: weekday ? 'short' : undefined,
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).formatToParts(Date.UTC(year, month - 1, day))
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    (parts.find((item) => item.type === type)?.value ?? '').replace(/[.,]$/, '')
  return { weekday: part('weekday'), day: part('day'), month: part('month') }
}

/** A 'YYYY-MM-DD' calendar date as "Thu 15 Oct" / "jue 15 oct" (no time zone involved). */
export function formatWeekday(date: string, locale: string): string {
  const { weekday, day, month } = calendarParts(date, locale, true)
  return `${weekday} ${day} ${month}`
}

/** A 'YYYY-MM-DD' calendar date as "5 Oct" / "5 oct". */
export function formatDayMonth(date: string, locale: string): string {
  const { day, month } = calendarParts(date, locale, false)
  return `${day} ${month}`
}
