import type { DateTime } from 'luxon'

/**
 * A classify run of an import batch (`POST /imports/:id/classify`) claims
 * the batch with `classify_started_at` and releases it when it ends
 * (`classify_finished_at`), also when it fails. A claim older than this
 * belongs to a run that died: it no longer counts and the next run takes
 * it over.
 */
export const CLASSIFY_CLAIM_MINUTES = 10

/** True while a live run holds the batch (`classifying` in the API). */
export function isClassifyRunning(startedAt: DateTime | null, now: DateTime): boolean {
  if (startedAt === null) return false
  return now.diff(startedAt, 'minutes').minutes < CLASSIFY_CLAIM_MINUTES
}
