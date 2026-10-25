import { Injectable, computed, inject, linkedSignal, resource, signal } from '@angular/core'
import { hasStatus, toApiError } from '../../core/api/http-errors'
import { TagsApi, type TagDetail, type TagRange } from '../../core/ledger/tags.api'
import { MonthStore } from '../../core/month/month.store'

export type TagDetailStatus = 'loading' | 'ready' | 'notFound' | 'error'

/**
 * One tag `/tags/:tag` (`GET /tags/:tag`): its totals by category, month
 * and person, over every date or the range picked on screen. Read again
 * after any change to the ledger (the tag spans every month) or of the
 * range, keeping the numbers on screen meanwhile. A tag nobody uses (or
 * only the partner, privately) is not found. Provided by the page.
 */
@Injectable()
export class TagDetailStore {
  private readonly api = inject(TagsApi)
  private readonly months = inject(MonthStore)

  private readonly tag = signal<string | null>(null)
  private readonly range = signal<TagRange>({})
  private readonly attempt = signal(0)

  private readonly loaded = resource({
    params: () => {
      const tag = this.tag()
      return tag === null
        ? undefined
        : {
            tag,
            range: this.range(),
            attempt: this.attempt(),
            revision: this.months.ledgerRevision(),
          }
    },
    loader: ({ params }) => this.api.show(params.tag, params.range),
  })

  /** The tag on screen; kept while a change in the ledger (or the range) reloads the same tag. */
  readonly detail = linkedSignal<TagDetail | undefined, TagDetail | undefined>({
    source: () => (this.loaded.hasValue() ? this.loaded.value() : undefined),
    computation: (next, previous) =>
      next ?? (previous?.value?.tag === this.tag() ? previous.value : undefined),
  })

  readonly status = computed<TagDetailStatus>(() => {
    if (this.loaded.status() === 'error') {
      return hasStatus(toApiError(this.loaded.error()), 404) ? 'notFound' : 'error'
    }
    return this.detail() ? 'ready' : 'loading'
  })

  open(tag: string): void {
    this.tag.set(tag)
  }

  /** The dates the totals cover; `{}` is every date. */
  setRange(range: TagRange): void {
    const current = this.range()
    if (current.from !== range.from || current.to !== range.to) {
      this.range.set(range)
    }
  }

  retry(): void {
    this.attempt.update((value) => value + 1)
  }
}
