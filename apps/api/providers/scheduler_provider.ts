import type { Scheduler } from '#services/scheduler/scheduler'
import type { ApplicationService } from '@adonisjs/core/types'

/**
 * Starts the in-process scheduler (app/services/scheduler/scheduler.ts)
 * once the HTTP server is up. Registered for the `web` environment only
 * (adonisrc.ts), so ace commands, the REPL and the test runner never tick;
 * within it, production only and not with `SCHEDULER=off`. Today's only job
 * is the monthly insights (app/services/insights/monthly_insights_job.ts).
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
    const clock = await this.app.container.make(Clock)
    this.#scheduler = new Scheduler(
      [await this.app.container.make(MonthlyInsightsJob)],
      () => clock.now(),
      await this.app.container.make('logger')
    )
    this.#scheduler.start()
  }

  async shutdown() {
    await this.#scheduler?.stop()
  }
}
