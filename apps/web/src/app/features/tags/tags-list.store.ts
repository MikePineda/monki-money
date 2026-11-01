import { Injectable, computed, inject, linkedSignal, resource, signal } from '@angular/core'
import { TagsApi, type TagSummary } from '../../core/ledger/tags.api'
import { TagsStore, type TagsStatus } from '../../core/ledger/tags.store'
import { MonthStore } from '../../core/month/month.store'
import { tagRangeOf, type TagPeriod } from './tag-period'

interface RangedList {
  period: TagPeriod
  tags: TagSummary[]
}

/**
 * The tags screen's list for the period on screen. Every date is the
 * shared {@link TagsStore} (the same list the forms suggest from); another
 * period reads `GET /tags?from=&to=` itself, again after any change to the
 * ledger, keeping the list on screen while the same period reloads.
 * Provided by the page.
 */
@Injectable()
export class TagsListStore {
  private readonly shared = inject(TagsStore)
  private readonly api = inject(TagsApi)
  private readonly months = inject(MonthStore)

  private readonly _period = signal<TagPeriod>('all')
  private readonly attempt = signal(0)

  readonly period = this._period.asReadonly()

  private readonly ranged = resource({
    params: () => {
      const period = this._period()
      return period === 'all'
        ? undefined
        : {
            period,
            range: tagRangeOf(period, this.months.current()),
            revision: this.months.ledgerRevision(),
            attempt: this.attempt(),
          }
    },
    loader: async ({ params }): Promise<RangedList> => ({
      period: params.period,
      tags: await this.api.list(params.range),
    }),
  })

  /** The last list of the current period, kept while it reloads. */
  private readonly shown = linkedSignal<RangedList | undefined, RangedList | undefined>({
    source: () => (this.ranged.hasValue() ? this.ranged.value() : undefined),
    computation: (next, previous) =>
      next ?? (previous?.value?.period === this._period() ? previous.value : undefined),
  })

  readonly tags = computed<TagSummary[]>(() =>
    this._period() === 'all' ? this.shared.tags() : (this.shown()?.tags ?? [])
  )

  readonly status = computed<TagsStatus>(() => {
    if (this._period() === 'all') {
      return this.shared.status()
    }
    if (this.shown()) {
      return 'ready'
    }
    return this.ranged.status() === 'error' ? 'error' : 'loading'
  })

  /** The shared list, read when there is none yet or the ledger changed. */
  load(): void {
    void this.shared.load()
  }

  setPeriod(period: TagPeriod): void {
    this._period.set(period)
    if (period === 'all') {
      this.load()
    }
  }

  retry(): void {
    if (this._period() === 'all') {
      void this.shared.refresh()
    } else {
      this.attempt.update((value) => value + 1)
    }
  }
}
