import type { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'

/**
 * The scheduler's lock and log (`scheduler_runs`): one row per job, period,
 * household and person (NULL household = an app-wide job, NULL person = a
 * household-wide one), unique across the four (NULLs equal).
 * Claiming a run is an `INSERT ... ON CONFLICT DO NOTHING`, so of two
 * containers ticking at once (start-first updates), a container that
 * restarted or a manual run, exactly one does the work. A claimed row is
 * taken over again only when:
 *
 * - its owner went away (no `finished_at` after STALE_AFTER);
 * - it failed with the retryable outcome (`failed`, e.g. the model's vendor
 *   was down, which costs nothing) at least RETRY_AFTER ago; any other
 *   outcome is final, `failed:final` included (a failure that already cost
 *   money, such as an unusable model answer);
 * - its owner released it unused (stopping before the work started).
 *
 * MAX_ATTEMPTS counts the takeovers; a release gives its attempt back. Every
 * write names the attempt it owns, so the old owner of a run taken over can
 * no longer finish or release it. Timestamps are the caller's `now`.
 */

/** A run still unfinished after this is assumed dead (container stopped mid-run). */
export const STALE_AFTER = { minutes: 30 }

/** A retryable failure is tried again after this. */
export const RETRY_AFTER = { hours: 1 }

/** Attempts per job, period and household, the first one included. */
export const MAX_ATTEMPTS = 3

/** The only outcome that is retried. */
export const RETRYABLE_FAILURE = 'failed'

/** A failure that must not be retried (it was already paid for). */
export const FINAL_FAILURE = 'failed:final'

/** Outcome of a claim given back unused: any container may take it right away. */
export const RELEASED = 'released'

export const SCHEDULER_RUNS_TABLE = 'scheduler_runs'

export interface RunKey {
  job: string
  /** What the run covers, e.g. the month being summarised ('2026-09'). */
  periodKey: string
  householdId: number | null
  /** A run per person (push notifications); omitted or null = household-wide. */
  userId?: number | null
}

/** Proof of ownership: the row and the attempt this process claimed. */
export interface RunClaim {
  id: number
  attempt: number
}

export interface RunResult {
  /** Short code: 'generated', 'skipped:no-activity', RETRYABLE_FAILURE, FINAL_FAILURE. */
  outcome: string
  /** What went wrong (no personal data). */
  error?: string | null
}

type ClaimRow = { id: number; attempts: number }
type OpenRow = { attempts: number; finished_at: Date | null; outcome: string | null }

export default class SchedulerRuns {
  /** The claim when this process owns the run now; null when someone else does (or did). */
  async claim(key: RunKey, now: DateTime): Promise<RunClaim | null> {
    const startedAt = now.toJSDate()
    const userId = key.userId ?? null
    const inserted = await db.rawQuery<{ rows: ClaimRow[] }>(
      `INSERT INTO ${SCHEDULER_RUNS_TABLE}
         (job, period_key, household_id, user_id, attempts, started_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?)
       ON CONFLICT DO NOTHING
       RETURNING id, attempts`,
      [key.job, key.periodKey, key.householdId, userId, startedAt, startedAt, startedAt]
    )
    if (inserted.rows.length > 0) return claimOf(inserted.rows[0])

    // Row locks make this a lock too: of two concurrent takeovers, the
    // second re-reads the row after the first one and no longer matches.
    const takenOver = await db.rawQuery<{ rows: ClaimRow[] }>(
      `UPDATE ${SCHEDULER_RUNS_TABLE}
          SET attempts = attempts + 1, started_at = ?, finished_at = NULL,
              outcome = NULL, error = NULL, updated_at = ?
        WHERE job = ? AND period_key = ? AND household_id IS NOT DISTINCT FROM ?
          AND user_id IS NOT DISTINCT FROM ?
          AND attempts < ?
          AND ((finished_at IS NULL AND started_at < ?)
               OR (outcome = ? AND finished_at < ?)
               OR outcome = ?)
        RETURNING id, attempts`,
      [
        startedAt,
        startedAt,
        key.job,
        key.periodKey,
        key.householdId,
        userId,
        MAX_ATTEMPTS,
        now.minus(STALE_AFTER).toJSDate(),
        RETRYABLE_FAILURE,
        now.minus(RETRY_AFTER).toJSDate(),
        RELEASED,
      ]
    )
    return takenOver.rows[0] ? claimOf(takenOver.rows[0]) : null
  }

  /** Records the result; false when the run was taken over meanwhile (nothing written). */
  async finish(claim: RunClaim, now: DateTime, result: RunResult): Promise<boolean> {
    const finishedAt = now.toJSDate()
    const updated = await this.owned(claim).update({
      finished_at: finishedAt,
      outcome: result.outcome.slice(0, 40),
      error: result.error?.slice(0, 500) ?? null,
      updated_at: finishedAt,
    })
    return countOf(updated) > 0
  }

  /** Gives an unused claim back (and its attempt): the next tick of any container takes it. */
  async release(claim: RunClaim, now: DateTime): Promise<boolean> {
    const releasedAt = now.toJSDate()
    const updated = await this.owned(claim).update({
      attempts: claim.attempt - 1,
      finished_at: releasedAt,
      outcome: RELEASED,
      error: null,
      updated_at: releasedAt,
    })
    return countOf(updated) > 0
  }

  /**
   * Whether the run may still happen: running now, given back, or a
   * retryable failure with attempts left. False when it never started or
   * ended for good.
   */
  async isOpen(key: RunKey): Promise<boolean> {
    const result = await db.rawQuery<{ rows: OpenRow[] }>(
      `SELECT attempts, finished_at, outcome FROM ${SCHEDULER_RUNS_TABLE}
        WHERE job = ? AND period_key = ? AND household_id IS NOT DISTINCT FROM ?
          AND user_id IS NOT DISTINCT FROM ?`,
      [key.job, key.periodKey, key.householdId, key.userId ?? null]
    )
    const row = result.rows[0]
    if (!row) return false
    if (row.finished_at === null || row.outcome === RELEASED) return true
    return row.outcome === RETRYABLE_FAILURE && row.attempts < MAX_ATTEMPTS
  }

  protected owned(claim: RunClaim) {
    return db
      .from(SCHEDULER_RUNS_TABLE)
      .where('id', claim.id)
      .where('attempts', claim.attempt)
      .whereNull('finished_at')
  }
}

function claimOf(row: ClaimRow): RunClaim {
  return { id: row.id, attempt: row.attempts }
}

/** Affected rows of an update (Lucid answers a number or an array, depending on the dialect). */
function countOf(updated: unknown): number {
  return Array.isArray(updated) ? updated.length : Number(updated)
}
