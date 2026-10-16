import type { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'

/**
 * The scheduler's lock and log (`scheduler_runs`): one row per job, period
 * and household (NULL household = an app-wide job), unique across the three.
 * Claiming a run is an `INSERT ... ON CONFLICT DO NOTHING`, so of two
 * containers ticking at once (start-first updates) or a container that
 * restarted, exactly one does the work. A claimed row is taken over again
 * only when its owner went away (no `finished_at` after STALE_AFTER) or it
 * failed (an `error`, retried after RETRY_AFTER, MAX_ATTEMPTS in total).
 * Every timestamp is the caller's `now`.
 */

/** A run still unfinished after this is assumed dead (container stopped mid-run). */
export const STALE_AFTER = { minutes: 30 }

/** A failed run is tried again after this. */
export const RETRY_AFTER = { hours: 1 }

/** Attempts per job, period and household, the first one included. */
export const MAX_ATTEMPTS = 3

export const SCHEDULER_RUNS_TABLE = 'scheduler_runs'

export interface RunKey {
  job: string
  /** What the run covers, e.g. the month being summarised ('2026-09'). */
  periodKey: string
  householdId: number | null
}

export interface RunResult {
  /** Short machine-readable outcome: 'generated', 'skipped:no-activity', 'failed'. */
  outcome: string
  /** Why it failed (no personal data); a failed run is retried. */
  error?: string | null
}

export default class SchedulerRuns {
  /** The run's id when this process owns it now, null when someone else does (or did). */
  async claim(key: RunKey, now: DateTime): Promise<number | null> {
    const startedAt = now.toJSDate()
    const inserted = await db.rawQuery<{ rows: Array<{ id: number }> }>(
      `INSERT INTO ${SCHEDULER_RUNS_TABLE}
         (job, period_key, household_id, attempts, started_at, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?, ?)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [key.job, key.periodKey, key.householdId, startedAt, startedAt, startedAt]
    )
    if (inserted.rows.length > 0) return inserted.rows[0].id

    // Row locks make this a lock too: of two concurrent takeovers, the
    // second re-reads the row after the first one and no longer matches.
    const takenOver = await db.rawQuery<{ rows: Array<{ id: number }> }>(
      `UPDATE ${SCHEDULER_RUNS_TABLE}
          SET attempts = attempts + 1, started_at = ?, finished_at = NULL,
              outcome = NULL, error = NULL, updated_at = ?
        WHERE job = ? AND period_key = ? AND household_id IS NOT DISTINCT FROM ?
          AND attempts < ?
          AND ((finished_at IS NULL AND started_at < ?)
               OR (error IS NOT NULL AND finished_at < ?))
        RETURNING id`,
      [
        startedAt,
        startedAt,
        key.job,
        key.periodKey,
        key.householdId,
        MAX_ATTEMPTS,
        now.minus(STALE_AFTER).toJSDate(),
        now.minus(RETRY_AFTER).toJSDate(),
      ]
    )
    return takenOver.rows[0]?.id ?? null
  }

  async finish(id: number, now: DateTime, result: RunResult): Promise<void> {
    const finishedAt = now.toJSDate()
    await db
      .from(SCHEDULER_RUNS_TABLE)
      .where('id', id)
      .update({
        finished_at: finishedAt,
        outcome: result.outcome.slice(0, 40),
        error: result.error?.slice(0, 500) ?? null,
        updated_at: finishedAt,
      })
  }
}
