import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import type { RunRecord } from '#services/scheduler/scheduler_runs'

/** Runs shown without --limit. */
const DEFAULT_LIMIT = 20

/** Most runs one call prints. */
const MAX_LIMIT = 500

/**
 * `node ace scheduler:runs [--limit N] [--job <name>] [--json]`: the
 * scheduler's latest runs (`scheduler_runs`), newest first, so operators
 * see what the jobs did without SQL. One line per run (start, job, period,
 * household, person, attempts, outcome or `running`, and the error), or a
 * JSON array for scripts (the `pulse` skill). Ids only: no names or emails.
 * Read-only.
 */
export default class SchedulerRunsCommand extends BaseCommand {
  static override commandName = 'scheduler:runs'
  static override description = "Show the scheduler's latest runs (newest first)"
  static override options: CommandOptions = { startApp: true }

  @flags.number({ description: `How many runs (default ${DEFAULT_LIMIT}, at most ${MAX_LIMIT})` })
  declare limit?: number

  @flags.string({ description: 'Only this job (e.g. monthly-insights, daily-reminder)' })
  declare job?: string

  @flags.boolean({ description: 'Print a JSON array instead of one line per run' })
  declare json?: boolean

  override async run() {
    const limit = this.limit ?? DEFAULT_LIMIT
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      this.logger.error(`--limit must be a whole number from 1 to ${MAX_LIMIT}`)
      this.exitCode = 1
      return
    }

    // App code is imported lazily, after the app (and its providers) booted.
    const { default: SchedulerRuns } = await import('#services/scheduler/scheduler_runs')
    const runs = await new SchedulerRuns().recent({ limit, job: this.job })

    if (this.json) {
      this.logger.log(JSON.stringify(runs))
      return
    }
    if (runs.length === 0) {
      this.logger.log('No scheduler runs yet')
      return
    }
    for (const run of runs) this.logger.log(describeRun(run))
  }
}

function describeRun(run: RunRecord): string {
  const outcome = run.outcome ?? 'running'
  const error = run.error ? `: ${run.error}` : ''
  return [
    run.startedAt,
    run.job,
    run.periodKey,
    `household=${run.householdId ?? '-'}`,
    `user=${run.userId ?? '-'}`,
    `attempts=${run.attempts}`,
    `${outcome}${error}`,
  ].join(' ')
}
