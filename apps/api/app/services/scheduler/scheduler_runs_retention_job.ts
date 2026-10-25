import { inject } from '@adonisjs/core'
import { Logger } from '@adonisjs/core/logger'
import type { ScheduledJob, TickContext } from '#services/scheduler/scheduler'
import { RUNS_RETENTION_MONTHS, retentionCutoff, retentionDay } from '#services/scheduler/retention'
import SchedulerRuns, { RETRYABLE_FAILURE } from '#services/scheduler/scheduler_runs'

/** Name in `scheduler_runs.job` and in the logs. */
export const RETENTION_JOB = 'scheduler-runs-retention'

/**
 * Keeps `scheduler_runs` from growing forever (a row per household and
 * month, and per person and day for the reminders): the first tick of each
 * UTC day claims the day as an app-wide run (job, 'YYYY-MM-DD', no
 * household) and deletes the runs that started more than 13 months ago
 * (retention.ts). The claim makes it once a day across containers and
 * restarts; its own row says how many went (`pruned:<n>`). A failed delete
 * is retried an hour later like any retryable run. Runs last in the tick,
 * after the jobs that do real work.
 */
@inject()
export default class SchedulerRunsRetentionJob implements ScheduledJob {
  readonly name = RETENTION_JOB

  constructor(
    protected runs: SchedulerRuns,
    protected logger: Logger
  ) {}

  async tick({ now, signal }: TickContext): Promise<void> {
    if (signal.aborted) return
    const startedAt = now()
    const day = retentionDay(startedAt)

    const claim = await this.runs.claim(
      { job: this.name, periodKey: day, householdId: null },
      startedAt
    )
    if (claim === null) return
    if (signal.aborted) {
      await this.runs.release(claim, now())
      return
    }

    try {
      const pruned = await this.runs.prune(retentionCutoff(startedAt))
      await this.runs.finish(claim, now(), { outcome: `pruned:${pruned}` })
      this.logger.info(
        { job: this.name, day, pruned },
        `scheduler runs: ${pruned} older than ${RUNS_RETENTION_MONTHS} months pruned`
      )
    } catch (error) {
      await this.runs.finish(claim, now(), {
        outcome: RETRYABLE_FAILURE,
        error: error instanceof Error ? error.message : String(error),
      })
      this.logger.error({ err: error, job: this.name, day }, 'scheduler runs: prune failed')
    }
  }
}
