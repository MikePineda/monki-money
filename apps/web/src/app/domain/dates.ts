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

/**
 * A calendar date ('YYYY-MM-DD', no time) with its weekday, for day-group
 * headers: "Wed 14 Oct" / "mié 14 oct", plus the year when asked. Read in
 * UTC so the device time zone can never move the day.
 */
export function formatWeekdayDate(
  isoDate: string,
  locale: string,
  options: { withYear?: boolean } = {}
): string {
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number]
  const parts = new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: options.withYear ? 'numeric' : undefined,
    timeZone: 'UTC',
  }).formatToParts(Date.UTC(year, month - 1, day))
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    (parts.find((item) => item.type === type)?.value ?? '').replace(/\.$/, '')
  const text = `${part('weekday')} ${part('day')} ${part('month')}`
  return options.withYear ? `${text} ${part('year')}` : text
}
