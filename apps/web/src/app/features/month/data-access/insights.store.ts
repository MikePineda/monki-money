import { Injectable, computed, inject, resource, signal } from '@angular/core'
import type { MonthlyInsight } from '../../../core/api/api-types'
import { hasStatus, toApiError } from '../../../core/api/http-errors'
import { validationRules } from '../../../core/api/validation-rules'
import { SessionStore } from '../../../core/auth/session.store'
import { LangStore } from '../../../core/i18n/lang.store'
import { MonthStore } from '../../../core/month/month.store'
import { CLOCK } from '../../../core/platform/clock.token'
import type { YearMonth } from '../../../domain/month'
import { InsightsApi } from './insights.api'

/** Why a generation did not give a new summary. */
export type GenerateFailure = 'noActivity' | 'future' | 'quota' | 'unavailable' | 'error'

/**
 * What the summary card shows for the month on screen:
 * - `loading`: the stored summary is being fetched (skeleton);
 * - `missing`: none yet in this language, offer "Generate";
 * - `generating`: the model is writing (skeleton);
 * - `ready`: the summary, with a `notice` when a regenerate just failed;
 * - `noActivity` / `future` / `quota` / `unavailable`: quiet messages;
 * - `error`: no connection or a server error, with "Try again".
 */
export type InsightView =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'generating' }
  | { status: 'ready'; insight: MonthlyInsight; notice: GenerateFailure | null }
  | { status: 'noActivity' | 'future' | 'quota' | 'unavailable' }
  | { status: 'error'; retry: 'load' | 'generate' }

interface CacheEntry {
  /** The month's ledger revision the view was read at. */
  revision: number
  view: InsightView
  /** When the API was last asked about it (ms), a re-check that failed included. */
  checkedAt: number
}

interface LoadParams {
  month: YearMonth
  locale: string
  key: string
  revision: number
}

/** Summaries kept in memory (month and language pairs). */
export const INSIGHT_CACHE_SIZE = 12
/** Entering the Month view re-checks a summary last read longer ago than this. */
export const INSIGHT_RECHECK_MS = 5 * 60_000
/** Back in the foreground: at most one re-check a minute, so a flapping tab does not spam. */
export const INSIGHT_FOREGROUND_RECHECK_MS = 60_000

function keyOf(month: YearMonth, locale: string): string {
  return `${locale}:${month}`
}

function failureOf(error: unknown): GenerateFailure {
  const failure = toApiError(error)
  if (failure.kind === 'validation') {
    const rule = validationRules(error)['month']
    return rule === 'noActivity' || rule === 'future' ? rule : 'error'
  }
  if (hasStatus(failure, 402)) {
    return 'quota'
  }
  return hasStatus(failure, 503) ? 'unavailable' : 'error'
}

/**
 * The LLM-written summary of the month on the Month view. One summary per
 * month and language, cached in memory: `GET /insights/:month` is asked
 * only when the month report (`insight`) does not say there is none in
 * this language. Switching months reads the cache,
 * a ledger change in that month (`MonthStore.revisionOf`) drops its entry
 * so the next read asks the API again, and a language change (the user's
 * saved locale, which the API answers in) reads the other language's
 * entry. Nothing is generated without a tap: `generate()` writes a new one
 * (`force` replaces the stored one). A summary the partner or the monthly
 * scheduler writes meanwhile changes nothing in the ledger, so `recheck()`
 * asks `GET /insights/:month` again (the light call) when the app returns
 * to the foreground or the Month view is entered (the card decides), at
 * most once per `minAgeMs` per month. Forgotten on logout.
 */
@Injectable({ providedIn: 'root' })
export class InsightsStore {
  private readonly api = inject(InsightsApi)
  private readonly months = inject(MonthStore)
  private readonly session = inject(SessionStore)
  private readonly lang = inject(LangStore)
  private readonly clock = inject(CLOCK)

  private readonly cache = new Map<string, CacheEntry>()
  private readonly month = signal<YearMonth | null>(null)
  private readonly attempt = signal(0)
  private readonly generatingKey = signal<string | null>(null)
  private lastForce = false
  private rechecking: Promise<void> | null = null

  /** The language the API answers in: the user's saved locale. */
  readonly locale = computed(() => this.session.user()?.locale ?? this.lang.lang())

  private readonly key = computed(() => {
    const month = this.month()
    return month === null ? null : keyOf(month, this.locale())
  })

  private readonly summary = resource({
    params: (): LoadParams | undefined => {
      const month = this.month()
      if (month === null) {
        return undefined
      }
      this.attempt()
      const locale = this.locale()
      return {
        month,
        locale,
        key: keyOf(month, locale),
        revision: this.months.revisionOf(month),
      }
    },
    loader: ({ params }) => this.load(params),
  })

  readonly view = computed<InsightView>(() => {
    const key = this.key()
    if (key !== null && this.generatingKey() === key) {
      return { status: 'generating' }
    }
    if (this.summary.isLoading() || !this.summary.hasValue()) {
      return { status: 'loading' }
    }
    return this.summary.value() ?? { status: 'loading' }
  })

  constructor() {
    this.session.onClear(() => {
      this.cache.clear()
      this.month.set(null)
    })
  }

  /** The month on screen. */
  show(month: YearMonth): void {
    this.month.set(month)
  }

  /** Asks the model for this month's summary; `force` replaces a stored one. */
  async generate(force = false): Promise<void> {
    const month = this.month()
    const key = this.key()
    if (month === null || key === null || this.generatingKey() !== null) {
      return
    }
    const before = this.view()
    const previous = before.status === 'ready' ? before.insight : null
    const revision = this.months.revisionOf(month)
    this.lastForce = force
    this.generatingKey.set(key)

    let view: InsightView
    try {
      const insight = await this.api.generate(month, force)
      view = { status: 'ready', insight, notice: null }
      this.remember(key, revision, view)
    } catch (error) {
      const failure = failureOf(error)
      if (previous) {
        // The stored summary is still the right one; only this attempt failed.
        view = { status: 'ready', insight: previous, notice: failure }
      } else if (failure === 'error') {
        view = { status: 'error', retry: 'generate' }
      } else {
        view = { status: failure }
        this.remember(key, revision, view)
      }
    } finally {
      this.generatingKey.set(null)
    }
    if (this.key() === key) {
      this.summary.set(view)
    }
  }

  /**
   * Asks again whether the month on screen has a summary (written by the
   * partner or the scheduler since it was read) when the last answer is
   * older than `minAgeMs`; a newer one replaces what is shown. Quiet on
   * failure; never while the model writes or nothing was read yet.
   */
  recheck(minAgeMs: number): Promise<void> {
    if (this.rechecking) {
      return this.rechecking
    }
    const month = this.month()
    const key = this.key()
    const cached = key === null ? undefined : this.cache.get(key)
    const now = this.clock().getTime()
    if (
      month === null ||
      key === null ||
      !cached ||
      this.generatingKey() !== null ||
      now - cached.checkedAt < minAgeMs
    ) {
      return Promise.resolve()
    }
    cached.checkedAt = now
    this.rechecking = this.ask(month, key, cached).finally(() => (this.rechecking = null))
    return this.rechecking
  }

  private async ask(month: YearMonth, key: string, cached: CacheEntry): Promise<void> {
    let insight: MonthlyInsight | null
    try {
      insight = await this.api.show(month)
    } catch {
      return
    }
    const unchanged =
      this.key() !== key ||
      this.generatingKey() !== null ||
      this.months.revisionOf(month) !== cached.revision ||
      this.cache.get(key) !== cached
    if (unchanged) {
      // The month, the language or the ledger moved meanwhile: its own load answers.
      return
    }
    const view = recheckedView(cached.view, insight)
    if (view !== cached.view) {
      this.remember(key, cached.revision, view)
      this.summary.set(view)
    }
  }

  /** "Try again" after an error: the same request that failed. */
  retry(): Promise<void> {
    const view = this.view()
    if (view.status === 'error' && view.retry === 'generate') {
      return this.generate(this.lastForce)
    }
    this.attempt.update((value) => value + 1)
    return Promise.resolve()
  }

  private async load({ month, locale, key, revision }: LoadParams): Promise<InsightView> {
    const cached = this.cache.get(key)
    if (cached && cached.revision === revision) {
      return cached.view
    }
    // The month report already says whether one is stored in this language:
    // no request that can only answer 404.
    const stored = this.months.cached(month)?.report.insight
    if (stored && stored.locale === locale && !stored.available) {
      const view: InsightView = { status: 'missing' }
      this.remember(key, revision, view)
      return view
    }
    try {
      const insight = await this.api.show(month)
      const view: InsightView = insight
        ? { status: 'ready', insight, notice: null }
        : { status: 'missing' }
      this.remember(key, revision, view)
      return view
    } catch {
      return { status: 'error', retry: 'load' }
    }
  }

  private remember(key: string, revision: number, view: InsightView): void {
    this.cache.delete(key)
    this.cache.set(key, { revision, view, checkedAt: this.clock().getTime() })
    while (this.cache.size > INSIGHT_CACHE_SIZE) {
      const oldest = this.cache.keys().next().value
      if (oldest === undefined) {
        break
      }
      this.cache.delete(oldest)
    }
  }
}

/**
 * What a re-check's answer changes on screen (the same object when
 * nothing): a summary that is new or newer replaces the view; none left
 * turns a shown summary into "Generate", and keeps a quiet state as it is.
 */
function recheckedView(view: InsightView, insight: MonthlyInsight | null): InsightView {
  if (insight === null) {
    return view.status === 'ready' ? { status: 'missing' } : view
  }
  if (view.status === 'ready' && view.insight.generatedAt === insight.generatedAt) {
    return view
  }
  return { status: 'ready', insight, notice: null }
}
