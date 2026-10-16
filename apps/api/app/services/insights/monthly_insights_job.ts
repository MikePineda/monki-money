import type { DateTime } from 'luxon'
import { inject } from '@adonisjs/core'
import Household from '#models/household'
import { Logger } from '@adonisjs/core/logger'
import { isLocale, type Locale } from '@monkimoney/shared'
import { FieldError } from '#exceptions/field_error'
import { LlmQuotaExceededError } from '#llm/errors'
import { InsightsUnavailable } from '#exceptions/errors'
import { monthRange, type Month } from '#domain/calendar/month'
import type { ScheduledJob } from '#services/scheduler/scheduler'
import SchedulerRuns from '#services/scheduler/scheduler_runs'
import InsightService from '#services/insights/insight_service'
import PostingsRepository from '#repositories/postings_repository'
import {
  decideMonthlyInsight,
  insightPeriodKey,
  isMonthlyInsightDue,
  type MonthlyInsightSkipReason,
} from '#domain/insights/monthly_schedule'

/** Name in `scheduler_runs.job` and in the logs. */
export const MONTHLY_INSIGHTS_JOB = 'monthly-insights'

export type MonthlyInsightSkip = MonthlyInsightSkipReason | 'quota-exhausted'

export type MonthlyInsightResult =
  | { status: 'generated' }
  | { status: 'skipped'; reason: MonthlyInsightSkip }
  | { status: 'failed'; error: string }

export interface MonthlyInsightOutcome {
  householdId: number
  month: Month
  locale: Locale
  result: MonthlyInsightResult
}

export interface MonthlyInsightsRunOptions {
  now: DateTime
  /** Month to summarise; default the previous month in each household's time zone. */
  month?: Month
  /** One household only. */
  householdId?: number
  /** Regenerate a month that already has a summary (replaced only once the model answered). */
  force?: boolean
}

const SKIP_LABELS: Record<MonthlyInsightSkip, string> = {
  'pending-deletion': 'pending deletion',
  'suspended': 'suspended',
  'already-generated': 'already generated',
  'no-activity': 'no activity',
  'llm-unavailable': 'LLM not configured',
  'quota-exhausted': 'quota exhausted',
}

/** One line per household: `household 12 2026-09 es: skipped (no activity)`. */
export function describeOutcome(outcome: MonthlyInsightOutcome): string {
  const { result } = outcome
  const what =
    result.status === 'generated'
      ? 'generated'
      : result.status === 'skipped'
        ? `skipped (${SKIP_LABELS[result.reason]})`
        : `failed (${result.error})`
  return `household ${outcome.householdId} ${outcome.month} ${outcome.locale}: ${what}`
}

/**
 * Writes last month's summary for every household, so it is waiting on the
 * 1st: from 08:00 in the household's time zone, in the household's
 * language, through the same InsightService as `POST /insights/:month/generate`
 * (quota, usage rows, invalid-output handling). Two entry points:
 *
 * - `tick(now)`: the in-process scheduler, every 15 minutes. Each due
 *   household is claimed once per month in `scheduler_runs` (so overlapping
 *   containers and restarts never write it twice), and its outcome is logged
 *   in one line and recorded there.
 * - `run(options)`: `node ace insights:generate`, any month, one or all
 *   households, `force` to regenerate. No lock, no due check.
 *
 * Neither throws for one household's sake: a failure is an outcome and the
 * next household still runs.
 */
@inject()
export default class MonthlyInsightsJob implements ScheduledJob {
  readonly name = MONTHLY_INSIGHTS_JOB

  constructor(
    protected insights: InsightService,
    protected postings: PostingsRepository,
    protected runs: SchedulerRuns,
    protected logger: Logger
  ) {}

  async tick(now: DateTime): Promise<void> {
    for (const household of await this.households()) {
      if (!isMonthlyInsightDue(now, household.timezone)) continue
      const month = insightPeriodKey(now, household.timezone)

      try {
        const runId = await this.runs.claim(
          { job: this.name, periodKey: month, householdId: household.id },
          now
        )
        if (runId === null) continue

        const outcome = await this.generateFor(household, month, false)
        await this.runs.finish(runId, now, recordOf(outcome.result))
        this.log(outcome)
      } catch (error) {
        // Only the lock's own statements land here (generateFor never throws).
        this.logger.error(
          { err: error, job: this.name, householdId: household.id, month },
          'monthly insights: could not record the run'
        )
      }
    }
  }

  async run(options: MonthlyInsightsRunOptions): Promise<MonthlyInsightOutcome[]> {
    const outcomes: MonthlyInsightOutcome[] = []
    for (const household of await this.households(options.householdId)) {
      const month = options.month ?? insightPeriodKey(options.now, household.timezone)
      outcomes.push(await this.generateFor(household, month, options.force ?? false))
    }
    return outcomes
  }

  /** One household and month. Never throws. */
  protected async generateFor(
    household: Household,
    month: Month,
    force: boolean
  ): Promise<MonthlyInsightOutcome> {
    const locale = localeOf(household)
    const outcome = (result: MonthlyInsightResult) => ({
      householdId: household.id,
      month,
      locale,
      result,
    })

    try {
      const range = monthRange(month)
      const decision = decideMonthlyInsight({
        status: household.status,
        month,
        postings:
          household.status === 'active'
            ? await this.postings.between(household, range.from, range.to)
            : [],
        alreadyGenerated: (await this.insights.show(household, month, locale)) !== null,
        force,
        llmAvailable: this.insights.available,
      })
      if (!decision.generate) return outcome({ status: 'skipped', reason: decision.reason })

      const { fresh } = await this.insights.generate(household, null, month, locale, { force })
      return outcome(
        fresh ? { status: 'generated' } : { status: 'skipped', reason: 'already-generated' }
      )
    } catch (error) {
      const skipped = skipReasonOf(error)
      if (skipped) return outcome({ status: 'skipped', reason: skipped })
      return outcome({ status: 'failed', error: errorText(error) })
    }
  }

  /** Every household (or the one asked for), oldest first. Not tenant data: the job spans them all. */
  protected households(id?: number) {
    const query = Household.query().orderBy('id')
    if (id !== undefined) query.where('id', id)
    return query
  }

  protected log(outcome: MonthlyInsightOutcome) {
    const context = {
      job: this.name,
      householdId: outcome.householdId,
      month: outcome.month,
      locale: outcome.locale,
      outcome: recordOf(outcome.result).outcome,
    }
    const message = `monthly insights: ${describeOutcome(outcome)}`
    if (outcome.result.status === 'failed') this.logger.warn(context, message)
    else this.logger.info(context, message)
  }
}

/** The household's language; anything unsupported falls back to English. */
function localeOf(household: Household): Locale {
  return isLocale(household.locale) ? household.locale : 'en'
}

/** Refusals of InsightService that are skips, not failures (a race past our own checks). */
function skipReasonOf(error: unknown): MonthlyInsightSkip | null {
  if (error instanceof LlmQuotaExceededError) return 'quota-exhausted'
  if (error instanceof InsightsUnavailable) return 'llm-unavailable'
  if (error instanceof FieldError && error.rule === 'noActivity') return 'no-activity'
  return null
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code
    return `${typeof code === 'string' ? code : error.name}: ${error.message}`
  }
  return String(error)
}

function recordOf(result: MonthlyInsightResult) {
  switch (result.status) {
    case 'generated':
      return { outcome: 'generated' }
    case 'skipped':
      return { outcome: `skipped:${result.reason}` }
    case 'failed':
      return { outcome: 'failed', error: result.error }
  }
}
