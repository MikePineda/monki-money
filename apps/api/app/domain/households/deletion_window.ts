import type { DateTime } from 'luxon'

/** Days a household stays restorable after the owner asks to delete it. */
export const DELETION_GRACE_DAYS = 30

export function deletionDate(now: DateTime): DateTime {
  return now.plus({ days: DELETION_GRACE_DAYS })
}

export function canRestore(scheduledAt: DateTime | null, now: DateTime): boolean {
  return scheduledAt !== null && scheduledAt > now
}
