import type { DateTime } from 'luxon'
import { inject } from '@adonisjs/core'
import Household from '#models/household'
import { Logger } from '@adonisjs/core/logger'
import { isLocale, type Locale } from '@monkimoney/shared'
import { FieldError } from '#exceptions/field_error'
import { InsightsUnavailable } from '#exceptions/errors'
import { monthRange, type Month } from '#domain/calendar/month'
import { LlmProviderError, LlmQuotaExceededError } from '#llm/errors'
import InsightService from '#services/insights/insight_service'
import PostingsRepository from '#repositories/postings_repository'
import type { ScheduledJob, TickContext } from '#services/scheduler/scheduler'
import SchedulerRuns, {
  FINAL_FAILURE,
  RETRYABLE_FAILURE,
  type RunClaim,
} from '#services/scheduler/scheduler_runs'
import {
  decideMonthlyInsight,
  insightPeriodKey,
  isMonthlyInsightDue,
  type MonthlyInsightSkipReason,
} from '#domain/insights/monthly_schedule'

/** Name in `scheduler_runs.job` and in the logs. */
export const MONTHLY_INSIGHTS_JOB = 'monthly-insights'

export type MonthlyInsightSkip = MonthlyInsightSkipReason | 'quota-exhausted' | 'already-run'

/**
 * `failed.retry`: only a vendor failure (no answer, nothing billed) is worth
 * another attempt; an unusable answer was already paid for (twice, with the
 * LLM layer's own retry), so it is final. `stopped`: the process began
 * stopping before the model call, nothing was spent.
 */
export type MonthlyInsightResult =
  | { status: 'generated' }
  | { status: 'skipped'; reason: MonthlyInsightSkip }
  | { status: 'failed'; error: string; retry: boolean }
  | { status: 'stopped' }

export interface MonthlyInsightOutcome {
  householdId: number
  month: Month
  locale: Locale
  result: MonthlyInsightResult
}

export interface MonthlyInsightsRunOptions {
  /** The current instant, read again for every household. */
  now: () => DateTime
  /** Month to summarise; default the previous month in each household's time zone. */
  month?: Month
  /** One household only. */
  householdId?: number
  /**
   * Regenerate even a summary that covers the whole month (replaced only once
   * the model answered), bypassing the scheduler's lock.
   */
  force?: boolean
}

const SKIP_LABELS: Record<MonthlyInsightSkip, string> = {
  'pending-deletion': 'pending deletion',
  'suspended': 'suspended',
  'already-generated': 'already generated',
  'no-activity': 'no activity',
  'llm-unavailable': 'LLM not configured',
  'quota-exhausted': 'quota exhausted',
  'already-run': 'already run; --force redoes it',
}

/** One line per household: `household 12 2026-09 es: skipped (no activity)`. */
export function describeOutcome(outcome: MonthlyInsightOutcome): string {
  const { result } = outcome
  const what =
    result.status === 'generated'
      ? 'generated'
      : result.status === 'skipped'
        ? `skipped (${SKIP_LABELS[result.reason]})`
        : result.status === 'failed'
          ? `failed (${result.error})`
          : 'stopped before the model call'
  return `household ${outcome.householdId} ${outcome.month} ${outcome.locale}: ${what}`
}

/**
 * Writes last month's summary for every household, so it is waiting on the
 * 1st: from 08:00 in the household's time zone, in the household's
 * language, through the same InsightService as `POST /insights/:month/generate`
 * (quota, usage rows, invalid-output handling). A summary someone tapped
 * before the month ended covers part of it only, so it is replaced (one
 * call, like any other); one written after the month ended is kept. Two
 * entry points:
 *
 * - `tick(context)`: the in-process scheduler, every 15 minutes. Each due
 *   household is claimed once per month in `scheduler_runs` (so overlapping
 *   containers and restarts never pay for it twice), and its outcome is
 *   logged in one line and recorded there. A stop request ends the tick
 *   before the next claim or model call; a claim not used yet is released.
 * - `run(options)`: `node ace insights:generate`, any month, one or all
 *   households, no 08:00 wait. It claims the same row as the scheduler, so a
 *   manual run and a tick never both pay; `force` regenerates and bypasses
 *   the lock.
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

  async tick({ now, signal }: TickContext): Promise<void> {
    for (const household of await this.households()) {
      if (signal.aborted) return
      const startedAt = now()
      if (!isMonthlyInsightDue(startedAt, household.timezone)) continue
      const month = insightPeriodKey(startedAt, household.timezone)

      try {
        const claim = await this.runs.claim(this.keyOf(household, month), startedAt)
        if (claim === null) continue

        const outcome = await this.generateFor(household, month, { force: false, signal })
        if (outcome.result.status === 'stopped') {
          await this.runs.release(claim, now())
          return
        }
        await this.record(claim, outcome, now())
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
    const force = options.force ?? false
    const outcomes: MonthlyInsightOutcome[] = []
    for (const household of await this.households(options.householdId)) {
      const month = options.month ?? insightPeriodKey(options.now(), household.timezone)
      try {
        if (force) {
          outcomes.push(await this.generateFor(household, month, { force }))
          continue
        }
        const claim = await this.runs.claim(this.keyOf(household, month), options.now())
        if (claim === null) {
          outcomes.push(outcomeOf(household, month, { status: 'skipped', reason: 'already-run' }))
          continue
        }
        const outcome = await this.generateFor(household, month, { force })
        await this.record(claim, outcome, options.now())
        outcomes.push(outcome)
      } catch (error) {
        const result = { status: 'failed', error: errorText(error), retry: false } as const
        outcomes.push(outcomeOf(household, month, result))
      }
    }
    return outcomes
  }

  /**
   * One household and month. Never throws. With a `signal`, answers
   * `stopped` instead of calling the model once it is aborted.
   */
  protected async generateFor(
    household: Household,
    month: Month,
    options: { force: boolean; signal?: AbortSignal }
  ): Promise<MonthlyInsightOutcome> {
    const locale = localeOf(household)
    const outcome = (result: MonthlyInsightResult) => outcomeOf(household, month, result)

    try {
      const range = monthRange(month)
      const stored = await this.insights.show(household, month, locale)
      const decision = decideMonthlyInsight({
        status: household.status,
        month,
        zone: household.timezone,
        postings:
          household.status === 'active'
            ? await this.postings.between(household, range.from, range.to)
            : [],
        storedAt: stored?.generatedAt ?? null,
        force: options.force,
        llmAvailable: this.insights.available,
      })
      if (!decision.generate) return outcome({ status: 'skipped', reason: decision.reason })
      if (options.signal?.aborted) return outcome({ status: 'stopped' })

      const { fresh } = await this.insights.generate(household, null, month, locale, {
        force: decision.replace,
      })
      return outcome(
        fresh ? { status: 'generated' } : { status: 'skipped', reason: 'already-generated' }
      )
    } catch (error) {
      const skipped = skipReasonOf(error)
      if (skipped) return outcome({ status: 'skipped', reason: skipped })
      return outcome({
        status: 'failed',
        error: errorText(error),
        retry: error instanceof LlmProviderError,
      })
    }
  }

  protected keyOf(household: Household, month: Month) {
    return { job: this.name, periodKey: month, householdId: household.id }
  }

  /** Writes the outcome, unless the run was taken over meanwhile (then says so). */
  protected async record(claim: RunClaim, outcome: MonthlyInsightOutcome, now: DateTime) {
    const recorded = await this.runs.finish(claim, now, recordOf(outcome.result))
    if (!recorded) {
      this.logger.warn(
        { job: this.name, householdId: outcome.householdId, month: outcome.month },
        'monthly insights: the run was taken over by another process; outcome not recorded'
      )
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

function outcomeOf(
  household: Household,
  month: Month,
  result: MonthlyInsightResult
): MonthlyInsightOutcome {
  return { householdId: household.id, month, locale: localeOf(household), result }
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

function recordOf(result: MonthlyInsightResult): { outcome: string; error?: string } {
  switch (result.status) {
    case 'generated':
      return { outcome: 'generated' }
    case 'skipped':
      return { outcome: `skipped:${result.reason}` }
    case 'failed':
      return { outcome: result.retry ? RETRYABLE_FAILURE : FINAL_FAILURE, error: result.error }
    case 'stopped':
      return { outcome: 'stopped' }
  }
}
