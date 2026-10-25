import type { DateTime } from 'luxon'
import type User from '#models/user'
import Clock from '#services/clock'
import Category from '#models/category'
import { inject } from '@adonisjs/core'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import type Household from '#models/household'
import { LlmProvider } from '#llm/llm_provider'
import type { HouseholdRef } from '#models/mixins/household_scoped'
import type { Locale } from '@monkimoney/shared'
import MonthlyInsight from '#models/monthly_insight'
import { FieldError } from '#exceptions/field_error'
import i18nManager from '@adonisjs/i18n/services/main'
import { InsightsUnavailable } from '#exceptions/errors'
import { postingsForHousehold } from '#domain/ledger/privacy'
import PostingsRepository from '#repositories/postings_repository'
import { householdMemberIds } from '#services/ledger/privacy_viewer'
import EntitlementsService from '#services/entitlements/entitlements_service'
import type { Posting } from '#domain/ledger/posting'
import { dayReached, sameDaysOf } from '#domain/reports/month_to_date'
import { addMonths, currentMonth, monthRange, todayIn, type Month } from '#domain/calendar/month'
import type {
  InsightCategoryLine,
  InsightInput,
  InsightProgress,
  InsightTotals,
  MonthlyInsight as Answer,
} from '#llm/types'
import { summarizeMonth, type CategoryLine, type MonthSummary } from '#domain/reports/month_summary'
import type { GeneratedInsight, GenerateInsightOptions } from '#services/insights/dto'

/** Slug of the line that gathers what is not categorized yet. */
const UNCATEGORIZED = 'uncategorized'

/**
 * The stored summary of a household's month in one language, as a query
 * (one row at most): the insights endpoints read it, and the month report
 * says whether it exists without loading the text.
 */
export function storedInsight(household: HouseholdRef, month: Month, locale: Locale) {
  return MonthlyInsight.query()
    .withScopes((scopes) => scopes.forHousehold(household))
    .where('month', month)
    .where('locale', locale)
}

/**
 * LLM-written summaries of a month, stored once per household, month and
 * language (any member reads them). The figures come from the same pure
 * month summary as the reports, over the ledger as the whole household may
 * see it: every private purchase keeps counting in the totals but never
 * shows up as a category line, not even the requester's own, because the
 * partner reads the stored text too.
 */
@inject()
export default class InsightService {
  constructor(
    protected llm: LlmProvider,
    protected postings: PostingsRepository,
    protected entitlements: EntitlementsService,
    protected clock: Clock
  ) {}

  /** The stored summary, or null when it was never generated. */
  show(household: Household, month: Month, locale: Locale) {
    return this.stored(household, month, locale).first()
  }

  /** The stored summary or 404 (E_ROW_NOT_FOUND). */
  find(household: Household, month: Month, locale: Locale) {
    return this.stored(household, month, locale).firstOrFail()
  }

  /** A model can write summaries: a live one, or the fake inside the test suite. */
  get available() {
    return this.llm.isLive || this.fakeLlmAllowed()
  }

  /**
   * Returns the stored summary (`fresh: false`) unless `force`; otherwise
   * asks the model and replaces it. Rejects (before any call) a month that
   * has not started (422 `month`/`future`), a month without income or
   * spending (422 `month`/`noActivity`), a missing model (503) and a used-up
   * monthly quota (402). `user` is null for the scheduled run.
   */
  async generate(
    household: Household,
    user: User | null,
    month: Month,
    locale: Locale,
    options: GenerateInsightOptions = {}
  ): Promise<GeneratedInsight> {
    if (!options.force) {
      const stored = await this.show(household, month, locale)
      if (stored) return { insight: stored, fresh: false }
    }

    const now = this.clock.now()
    if (month > currentMonth(now, household.timezone)) throw new FieldError('month', 'future')

    const previousMonth = addMonths(month, -1)
    const postings = postingsForHousehold(
      await this.postings.between(household, monthRange(previousMonth).from, monthRange(month).to),
      await householdMemberIds(household)
    )
    const summary = summarizeMonth(postings, month)
    if (summary.transactionCount === 0) throw new FieldError('month', 'noActivity')

    if (!this.available) throw new InsightsUnavailable()
    await this.entitlements.assertLlmQuota(household, now)

    const base = comparisonBase(postings, month, todayIn(now, household.timezone))
    const input = await this.input(household, summary, base, locale)
    const result = await this.llm.monthlyInsight(input, {
      householdId: household.id,
      userId: user?.id ?? null,
      locale,
    })

    const insight = await this.store(household, user, input, locale, {
      answer: result.data,
      model: result.usage.model,
      now,
    })
    return { insight, fresh: true }
  }

  protected stored(household: Household, month: Month, locale: Locale) {
    return storedInsight(household, month, locale)
  }

  /**
   * The fake provider answers from test fixtures: fine for the test suite,
   * never for a real household.
   */
  protected fakeLlmAllowed() {
    return app.inTest
  }

  /**
   * The figures the model gets: totals, the month before (over the same
   * days while `summary`'s month is running) and one line per category.
   */
  protected async input(
    household: Household,
    summary: MonthSummary,
    base: ComparisonBase,
    locale: Locale
  ): Promise<InsightInput> {
    const { previous, hasPrevious, progress } = base
    const nameOf = await this.namer(household, [summary, previous], locale)
    const keyOf = (line: CategoryLine) => `${line.bucket}:${line.categoryId}:${line.kind}`
    const previousAmounts = new Map(
      previous.byCategory.map((line) => [keyOf(line), line.amountCents])
    )
    const lines = new Map<string, InsightCategoryLine>()

    for (const line of summary.byCategory) {
      if (line.bucket === 'private') continue
      lines.set(keyOf(line), {
        ...nameOf(line),
        kind: line.kind,
        amountCents: line.amountCents,
        previousAmountCents: hasPrevious ? (previousAmounts.get(keyOf(line)) ?? 0) : null,
      })
    }
    // Categories that went quiet this month are news too.
    for (const line of previous.byCategory) {
      if (line.bucket === 'private' || lines.has(keyOf(line))) continue
      lines.set(keyOf(line), {
        ...nameOf(line),
        kind: line.kind,
        amountCents: 0,
        previousAmountCents: line.amountCents,
      })
    }

    return {
      month: summary.month,
      currencyCode: household.currencyCode,
      ...(progress ? { inProgress: progress } : {}),
      totals: totalsOf(summary),
      previousTotals: hasPrevious ? totalsOf(previous) : null,
      byCategory: [...lines.values()].sort(
        (a, b) =>
          (a.kind === b.kind ? 0 : a.kind === 'expense' ? -1 : 1) ||
          b.amountCents - a.amountCents ||
          (b.previousAmountCents ?? 0) - (a.previousAmountCents ?? 0) ||
          a.slug.localeCompare(b.slug)
      ),
    }
  }

  /** Slug and name of a line in `locale` (system categories translated, custom ones as typed). */
  protected async namer(household: Household, summaries: MonthSummary[], locale: Locale) {
    const i18n = i18nManager.locale(locale)
    const ids = new Set(
      summaries.flatMap((summary) =>
        summary.byCategory.flatMap((line) => (line.categoryId === null ? [] : [line.categoryId]))
      )
    )
    const rows = await Category.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .whereIn('id', [...ids])
    const categories = new Map(rows.map((category) => [category.id, category]))

    return (line: CategoryLine) => {
      const category = line.categoryId === null ? undefined : categories.get(line.categoryId)
      if (line.bucket === 'uncategorized' || !category) {
        return { slug: UNCATEGORIZED, name: i18n.t('messages.insights.uncategorized') }
      }
      return {
        slug: category.slug,
        name: category.isSystem
          ? i18n.t(`categories.${category.slug}`, {}, category.name)
          : category.name,
      }
    }
  }

  /** Insert or replace the summary of (household, month, locale) in one statement. */
  protected async store(
    household: Household,
    user: User | null,
    input: InsightInput,
    locale: Locale,
    generated: { answer: Answer; model: string; now: DateTime }
  ) {
    const stamp = generated.now.toJSDate()
    await db
      .knexQuery()
      .table(MonthlyInsight.table)
      .insert({
        household_id: household.id,
        month: input.month,
        locale,
        headline: generated.answer.headline,
        body_markdown: generated.answer.body,
        highlights: JSON.stringify(generated.answer.highlights),
        input_json: JSON.stringify(input),
        model: generated.model.slice(0, 120),
        generated_by_user_id: user?.id ?? null,
        generated_at: stamp,
        created_at: stamp,
        updated_at: stamp,
      })
      .onConflict(['household_id', 'month', 'locale'])
      .merge([
        'headline',
        'body_markdown',
        'highlights',
        'input_json',
        'model',
        'generated_by_user_id',
        'generated_at',
        'updated_at',
      ])

    return this.find(household, input.month, locale)
  }
}

/** What the month is compared with. */
interface ComparisonBase {
  /** The previous month, whole or over the same days as the running month. */
  previous: MonthSummary
  /** The previous month had income or spending at all (any day). */
  hasPrevious: boolean
  /** Set while the month is running today. */
  progress: InsightProgress | null
}

/**
 * The previous month whole once `month` has ended; while it is running,
 * only its first days up to today's day (capped at its length), like the
 * Month view (`previousToDate`): half a month never reads as spending far
 * less than a whole one. A previous month quiet on those days still
 * compares (as zero) when it had activity later on.
 */
function comparisonBase(postings: Posting[], month: Month, today: string): ComparisonBase {
  const previousMonth = addMonths(month, -1)
  const whole = summarizeMonth(postings, previousMonth)
  const hasPrevious = whole.transactionCount > 0
  const day = dayReached(month, today)
  if (day === null) return { previous: whole, hasPrevious, progress: null }

  const window = sameDaysOf(previousMonth, day)
  const sameDays = postings.filter(
    (posting) => posting.date >= window.from && posting.date <= window.to
  )
  return {
    previous: summarizeMonth(sameDays, previousMonth),
    hasPrevious,
    progress: {
      daysElapsed: day,
      daysInMonth: Number(monthRange(month).to.slice(8, 10)),
      previousThroughDay: window.throughDay,
    },
  }
}

function totalsOf(summary: MonthSummary): InsightTotals {
  return {
    incomeCents: summary.incomeCents,
    expenseCents: summary.expenseCents,
    netCents: summary.netCents,
  }
}
