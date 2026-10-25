import type { Scheduler } from '#services/scheduler/scheduler'
import type { ApplicationService } from '@adonisjs/core/types'

/**
 * Starts the in-process scheduler (app/services/scheduler/scheduler.ts)
 * once the HTTP server is up. Registered for the `web` environment only
 * (adonisrc.ts), so ace commands, the REPL and the test runner never tick;
 * within it, production only and not with `SCHEDULER=off`. Jobs, in tick
 * order: the monthly insights (app/services/insights/monthly_insights_job.ts),
 * the "summary ready" push that follows them, the opt-in daily reminder
 * push (app/services/push) and the daily prune of old `scheduler_runs`
 * (app/services/scheduler/scheduler_runs_retention_job.ts).
 */
export default class SchedulerProvider {
  #scheduler: Scheduler | null = null

  constructor(protected app: ApplicationService) {}

  async ready() {
    // App code loads lazily, once every other provider has booted.
    const { default: env } = await import('#start/env')
    const { Scheduler, schedulerEnabled } = await import('#services/scheduler/scheduler')
    if (!schedulerEnabled({ inProduction: this.app.inProduction, setting: env.get('SCHEDULER') })) {
      return
    }

    const { default: Clock } = await import('#services/clock')
    const { default: MonthlyInsightsJob } = await import('#services/insights/monthly_insights_job')
    const { default: SummaryReadyJob } = await import('#services/push/summary_ready_job')
    const { default: DailyReminderJob } = await import('#services/push/daily_reminder_job')
    const { default: SchedulerRunsRetentionJob } =
      await import('#services/scheduler/scheduler_runs_retention_job')
    const clock = await this.app.container.make(Clock)
    this.#scheduler = new Scheduler(
      [
        await this.app.container.make(MonthlyInsightsJob),
        // Right after the summaries: a summary written this tick is announced this tick.
        await this.app.container.make(SummaryReadyJob),
        await this.app.container.make(DailyReminderJob),
        // Housekeeping last: once a day, drops runs past their retention.
        await this.app.container.make(SchedulerRunsRetentionJob),
      ],
      () => clock.now(),
      await this.app.container.make('logger')
    )
    this.#scheduler.start()
  }

  async shutdown() {
    await this.#scheduler?.stop()
  }
}
