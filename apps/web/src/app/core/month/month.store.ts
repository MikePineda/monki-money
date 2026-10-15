import { Injectable, computed, inject, signal, type Signal } from '@angular/core'
import { currentMonthIn, monthOf, type IsoDate, type YearMonth } from '../../domain/month'
import { SessionStore } from '../auth/session.store'
import { HOUSEHOLD_TIME_ZONE } from '../platform/time-zone.token'

/**
 * The month the app is looking at, shared by the Month view and the
 * transactions list, and the hook every mutation uses to say "this month
 * changed": `invalidate(month)` bumps that month's revision, and whatever
 * reads `revision(month)` (a list resource, a month summary cache) reloads.
 *
 * Minimal on purpose: the Month view package extends it with the summary
 * cache (`Map<YearMonth, MonthSummary>`, six months).
 */
@Injectable({ providedIn: 'root' })
export class MonthStore {
  private readonly timeZone = inject(HOUSEHOLD_TIME_ZONE)
  private readonly revisions = signal<ReadonlyMap<YearMonth, number>>(new Map())

  /** This month in the household's time zone. */
  readonly current = computed(() => currentMonthIn(this.timeZone()))
  /** The month on screen; starts on the current one. */
  readonly selectedMonth = signal<YearMonth>(this.current())

  constructor() {
    inject(SessionStore).onClear(() => {
      this.revisions.set(new Map())
      this.selectedMonth.set(this.current())
    })
  }

  /** How many times this month changed since the app started (a reload trigger). */
  revision(month: YearMonth): Signal<number> {
    return computed(() => this.revisionOf(month))
  }

  /** The current revision, read inside a reactive context (a resource's params, a computed). */
  revisionOf(month: YearMonth): number {
    return this.revisions().get(month) ?? 0
  }

  /** Something in this month changed (a create, an edit, a delete, a split). */
  invalidate(month: YearMonth): void {
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
}
