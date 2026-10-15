/**
 * "5 minutes ago", "yesterday", "hace 2 horas": how long ago a timestamp
 * was, in the reader's locale (Intl.RelativeTimeFormat with numeric
 * `auto`). Pure: `now` is passed in. A timestamp slightly in the future (a
 * device clock behind the server) reads as "now".
 */

const STEPS: readonly { unit: Intl.RelativeTimeFormatUnit; seconds: number }[] = [
  { unit: 'year', seconds: 365 * 24 * 3600 },
  { unit: 'month', seconds: 30 * 24 * 3600 },
  { unit: 'day', seconds: 24 * 3600 },
  { unit: 'hour', seconds: 3600 },
  { unit: 'minute', seconds: 60 },
]

const formatters = new Map<string, Intl.RelativeTimeFormat>()

function formatter(locale: string): Intl.RelativeTimeFormat {
  let cached = formatters.get(locale)
  if (!cached) {
    cached = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
    formatters.set(locale, cached)
  }
  return cached
}

export function relativeTime(isoTimestamp: string, now: Date, locale: string): string {
  const elapsed = Math.max(0, (now.getTime() - new Date(isoTimestamp).getTime()) / 1000)
  for (const step of STEPS) {
    if (elapsed >= step.seconds) {
      return formatter(locale).format(-Math.floor(elapsed / step.seconds), step.unit)
    }
  }
  return formatter(locale).format(0, 'second')
}
