import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

/**
 * `node ace insights:generate [--month YYYY-MM] [--household <id>] [--force]`:
 * the scheduled monthly summaries by hand (a missed 1st, a household that
 * failed, a regenerate). Same job and rules as the scheduler, without its
 * lock or its 08:00 wait: default month = the previous month in each
 * household's time zone, every household unless --household, and --force
 * replaces a month that already has a summary (only once the model
 * answered, so a failed regenerate keeps the old one). Prints one line per
 * household; exits 1 when any of them failed.
 */
export default class InsightsGenerate extends BaseCommand {
  static override commandName = 'insights:generate'
  static override description = 'Generate the monthly AI summaries now (the scheduled job, by hand)'
  static override options: CommandOptions = { startApp: true }

  @flags.string({
    description: 'Month to summarise, YYYY-MM (default: the previous month in each household)',
  })
  declare month?: string

  @flags.number({ description: 'Only this household id (default: every household)' })
  declare household?: number

  @flags.boolean({ description: 'Regenerate even when the month already has a summary' })
  declare force?: boolean

  override async run() {
    // App code is imported lazily, after the app (and its providers) booted.
    const { default: Clock } = await import('#services/clock')
    const { isMonth } = await import('#domain/calendar/month')
    const { default: MonthlyInsightsJob, describeOutcome } =
      await import('#services/insights/monthly_insights_job')

    if (this.month !== undefined && !isMonth(this.month)) {
      return this.fail('--month must be YYYY-MM')
    }

    const job = await this.app.container.make(MonthlyInsightsJob)
    const clock = await this.app.container.make(Clock)
    const outcomes = await job.run({
      now: clock.now(),
      month: this.month,
      householdId: this.household,
      force: this.force ?? false,
    })
    if (this.household !== undefined && outcomes.length === 0) {
      return this.fail(`Household ${this.household} not found`)
    }

    for (const outcome of outcomes) this.logger.log(describeOutcome(outcome))
    if (outcomes.some((outcome) => outcome.result.status === 'failed')) this.exitCode = 1
  }

  protected fail(message: string) {
    this.logger.error(message)
    this.exitCode = 1
  }
}
