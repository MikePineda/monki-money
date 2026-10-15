import { Injectable, computed, inject, resource, signal } from '@angular/core'
import { addMonths, compareYearMonth, currentMonthIn, type YearMonth } from '../../domain/month'
import type { Transaction } from '../api/api-types'
import { SessionStore } from '../auth/session.store'
import { ReportsApi, type MonthReport, type TrendReport } from '../ledger/reports.api'
import { TransactionsApi } from '../ledger/transactions.api'
import { HOUSEHOLD_TIME_ZONE } from '../platform/time-zone.token'

/** Months kept in memory (DESIGN.md, Month: switching back is instant). */
export const MONTH_CACHE_SIZE = 6
/** The trend line, the sparklines and the insights' averages read this many months. */
export const TREND_MONTHS = 6
export const TOP_TRANSACTIONS = 5

/** Everything the Month view draws for one month. */
export interface MonthSnapshot {
  month: YearMonth
  report: MonthReport
  trend: TrendReport
  /** The month's largest expenses, biggest first. */
  top: Transaction[]
}

/**
 * - `loading`: first load, nothing to show yet (skeletons);
 * - `reloading`: another month (or fresh numbers) on the way while the
 *   previous frame stays on screen at 60% opacity;
 * - `ready` / `error`.
 */
export type MonthStatus = 'loading' | 'reloading' | 'ready' | 'error'

/** True when `month`'s snapshot depends on `changed` (its trend window includes it). */
export function coversMonth(month: YearMonth, changed: YearMonth): boolean {
  return (
    compareYearMonth(changed, month) <= 0 &&
    compareYearMonth(changed, addMonths(month, -(TREND_MONTHS - 1))) >= 0
  )
}

/**
 * The Month view's data: the selected month, its snapshot as a `resource()`
 * and an in-memory cache of the last {@link MONTH_CACHE_SIZE} months.
 * Root-provided so quick add (or any other mutation) can `invalidate()` the
 * month it touched: the cached months whose numbers depend on it are
 * dropped and the selected one reloads, keeping the previous frame visible.
 */
@Injectable({ providedIn: 'root' })
export class MonthStore {
  private readonly reports = inject(ReportsApi)
  private readonly transactions = inject(TransactionsApi)
  private readonly timeZone = inject(HOUSEHOLD_TIME_ZONE)

  private readonly cache = new Map<YearMonth, MonthSnapshot>()
  /** Bumped to refetch the selected month even though it did not change. */
  private readonly version = signal(0)
  private readonly _selected = signal<YearMonth>(currentMonthIn(this.timeZone()))

  readonly selectedMonth = this._selected.asReadonly()

  readonly summary = resource({
    params: () => ({ month: this._selected(), version: this.version() }),
    loader: ({ params, abortSignal }) => this.fetch(params.month, abortSignal),
  })

  /** The last snapshot any load delivered (cache hits included). */
  private readonly lastLoaded = signal<MonthSnapshot | undefined>(undefined)

  /** What the screen draws: the loaded month, or the previous one while another loads. */
  readonly frame = computed(() =>
    this.summary.hasValue() ? this.summary.value() : this.lastLoaded()
  )

  readonly status = computed<MonthStatus>(() => {
    switch (this.summary.status()) {
      case 'error':
        return 'error'
      case 'resolved':
      case 'local':
        return 'ready'
      default:
        return this.frame() ? 'reloading' : 'loading'
    }
  })

  constructor() {
    inject(SessionStore).onClear(() => this.clear())
  }

  /** The current month in the household's time zone. */
  currentMonth(): YearMonth {
    return currentMonthIn(this.timeZone())
  }

  select(month: YearMonth): void {
    this._selected.set(month)
  }

  /** Fetches the selected month again (after an error, or on demand). */
  retry(): void {
    this.cache.delete(this._selected())
    this.version.update((value) => value + 1)
  }

  /**
   * After any mutation dated in `month`: forget every cached month whose
   * numbers include it, and reload the selected one if it is among them.
   */
  invalidate(month: YearMonth): void {
    for (const cached of [...this.cache.keys()]) {
      if (coversMonth(cached, month)) {
        this.cache.delete(cached)
      }
    }
    if (coversMonth(this._selected(), month)) {
      this.version.update((value) => value + 1)
    }
  }

  /** Logout: nothing of this household stays in memory. */
  clear(): void {
    this.cache.clear()
    this._selected.set(this.currentMonth())
    this.lastLoaded.set(undefined)
  }

  private async fetch(month: YearMonth, abortSignal: AbortSignal): Promise<MonthSnapshot> {
    const cached = this.cache.get(month)
    if (cached) {
      // Refresh its place in the least-recently-used order.
      this.cache.delete(month)
      this.cache.set(month, cached)
      this.lastLoaded.set(cached)
      return cached
    }
    const [report, trend, top] = await Promise.all([
      this.reports.month(month),
      this.reports.trend(month, TREND_MONTHS),
      this.transactions.list({ month, kind: 'expense', sort: 'amount', perPage: TOP_TRANSACTIONS }),
    ])
    const snapshot: MonthSnapshot = { month, report, trend, top }
    if (!abortSignal.aborted) {
      this.remember(snapshot)
      this.lastLoaded.set(snapshot)
    }
    return snapshot
  }

  private remember(snapshot: MonthSnapshot): void {
    this.cache.set(snapshot.month, snapshot)
    while (this.cache.size > MONTH_CACHE_SIZE) {
      const oldest = this.cache.keys().next().value
      if (oldest === undefined) {
        break
      }
      this.cache.delete(oldest)
    }
  }
}
