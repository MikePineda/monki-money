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
