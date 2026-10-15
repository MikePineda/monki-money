import { Injectable, computed, inject, resource, signal, type Signal } from '@angular/core'
import {
  addMonths,
  compareYearMonth,
  currentMonthIn,
  monthOf,
  monthRange,
  type IsoDate,
  type YearMonth,
} from '../../domain/month'
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
 * The month the app is looking at, shared by the Month view and the
 * transactions list, and the hook every mutation uses to say "this month
 * changed".
 *
 * - `selectedMonth` is the month on screen (the transactions list filters
 *   by it too); it starts on the current month of the household.
 * - `invalidate(month)` bumps that month's revision: whatever reads
 *   `revision(month)` / `revisionOf(month)` (a list resource) reloads, the
 *   cached snapshots whose numbers include it are dropped, and the Month
 *   view's snapshot reloads when its trend window covers it.
 * - `summary` is the selected month's snapshot as a `resource()`, served
 *   from an in-memory cache of the last {@link MONTH_CACHE_SIZE} months;
 *   `frame` keeps the previous snapshot on screen while another loads.
 */
@Injectable({ providedIn: 'root' })
export class MonthStore {
  private readonly reports = inject(ReportsApi)
  private readonly transactions = inject(TransactionsApi)
  private readonly timeZone = inject(HOUSEHOLD_TIME_ZONE)

  private readonly cache = new Map<YearMonth, MonthSnapshot>()
  private readonly revisions = signal<ReadonlyMap<YearMonth, number>>(new Map())
  /** Bumped by `retry()` to refetch the selected month although nothing changed. */
  private readonly attempt = signal(0)
  /** The last snapshot any load delivered (cache hits included). */
  private readonly lastLoaded = signal<MonthSnapshot | undefined>(undefined)

  /** This month in the household's time zone. */
  readonly current = computed(() => currentMonthIn(this.timeZone()))
  /** The month on screen; starts on the current one. */
  readonly selectedMonth = signal<YearMonth>(this.current())

  readonly summary = resource({
    params: () => {
      const month = this.selectedMonth()
      return { month, revision: this.windowRevision(month), attempt: this.attempt() }
    },
    loader: ({ params, abortSignal }) => this.fetch(params.month, abortSignal),
  })

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

  select(month: YearMonth): void {
    this.selectedMonth.set(month)
  }

  /** How many times this month changed since the app started (a reload trigger). */
  revision(month: YearMonth): Signal<number> {
    return computed(() => this.revisionOf(month))
  }

  /** The current revision, read inside a reactive context (a resource's params, a computed). */
  revisionOf(month: YearMonth): number {
    return this.revisions().get(month) ?? 0
  }

  /** Something dated in this month changed (a create, an edit, a delete, a split). */
  invalidate(month: YearMonth): void {
    for (const cached of [...this.cache.keys()]) {
      if (coversMonth(cached, month)) {
        this.cache.delete(cached)
      }
    }
    this.revisions.update((current) => {
      const next = new Map(current)
      next.set(month, (current.get(month) ?? 0) + 1)
      return next
    })
  }

  /** Same as {@link invalidate} for the month a 'YYYY-MM-DD' date falls in. */
  invalidateDate(date: IsoDate): void {
    this.invalidate(monthOf(date))
  }

  /** Fetches the selected month again (after an error, or on demand). */
  retry(): void {
    this.cache.delete(this.selectedMonth())
    this.attempt.update((value) => value + 1)
  }

  /** Logout: nothing of this household stays in memory. */
  clear(): void {
    this.cache.clear()
    this.revisions.set(new Map())
    this.lastLoaded.set(undefined)
    this.selectedMonth.set(this.current())
  }

  /** The revisions of every month the snapshot of `month` reads (its trend window). */
  private windowRevision(month: YearMonth): number {
    return monthRange(addMonths(month, -(TREND_MONTHS - 1)), month).reduce(
      (total, covered) => total + this.revisionOf(covered),
      0
    )
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
