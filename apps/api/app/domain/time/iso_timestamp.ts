import type { DateTime } from 'luxon'

/** ISO-8601 timestamp for the wire (null stays null). */
export function isoTimestamp(value: DateTime | null | undefined): string | null {
  return value ? value.toUTC().toISO() : null
}
