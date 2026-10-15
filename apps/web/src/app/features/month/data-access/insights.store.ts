import { Injectable, computed, inject, resource, signal } from '@angular/core'
import type { MonthlyInsight } from '../../../core/api/api-types'
import { hasStatus, toApiError } from '../../../core/api/http-errors'
import { validationRules } from '../../../core/api/validation-rules'
import { SessionStore } from '../../../core/auth/session.store'
import { LangStore } from '../../../core/i18n/lang.store'
import { MonthStore } from '../../../core/month/month.store'
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
}

interface LoadParams {
  month: YearMonth
  key: string
  revision: number
}

/** Summaries kept in memory (month and language pairs). */
export const INSIGHT_CACHE_SIZE = 12

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
 * month and language, cached in memory: switching months reads the cache,
 * a ledger change in that month (`MonthStore.revisionOf`) drops its entry
 * so the next read asks the API again, and a language change (the user's
 * saved locale, which the API answers in) reads the other language's
 * entry. Nothing is generated without a tap: `generate()` writes a new one
 * (`force` replaces the stored one). Forgotten on logout.
 */
@Injectable({ providedIn: 'root' })
export class InsightsStore {
  private readonly api = inject(InsightsApi)
  private readonly months = inject(MonthStore)
  private readonly session = inject(SessionStore)
  private readonly lang = inject(LangStore)

  private readonly cache = new Map<string, CacheEntry>()
  private readonly month = signal<YearMonth | null>(null)
  private readonly attempt = signal(0)
  private readonly generatingKey = signal<string | null>(null)
  private lastForce = false

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
      return {
        month,
        key: keyOf(month, this.locale()),
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

  /** "Try again" after an error: the same request that failed. */
  retry(): Promise<void> {
    const view = this.view()
    if (view.status === 'error' && view.retry === 'generate') {
      return this.generate(this.lastForce)
    }
    this.attempt.update((value) => value + 1)
    return Promise.resolve()
  }

  private async load({ month, key, revision }: LoadParams): Promise<InsightView> {
    const cached = this.cache.get(key)
    if (cached && cached.revision === revision) {
      return cached.view
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
    this.cache.set(key, { revision, view })
    while (this.cache.size > INSIGHT_CACHE_SIZE) {
      const oldest = this.cache.keys().next().value
      if (oldest === undefined) {
        break
      }
      this.cache.delete(oldest)
    }
  }
}
