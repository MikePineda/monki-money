import { Injectable, computed, inject, signal, untracked } from '@angular/core'
import { SessionStore } from '../auth/session.store'
import { MonthStore } from '../month/month.store'
import { TagsApi, type TagSummary } from './tags.api'

export type TagsStatus = 'loading' | 'ready' | 'error'

/**
 * The household's tags with their totals (`GET /tags`), shared by every
 * screen that offers them: the transaction forms' suggestions, the tag
 * filter of the transactions list and the tags screen. Read on demand
 * with {@link load}, which asks again only once the ledger changed
 * (MonthStore.ledgerRevision). Forgotten on logout.
 */
@Injectable({ providedIn: 'root' })
export class TagsStore {
  private readonly api = inject(TagsApi)
  private readonly months = inject(MonthStore)

  private readonly _tags = signal<TagSummary[]>([])
  private readonly _status = signal<TagsStatus>('loading')
  /** The ledger revision the list on hand was read at; null before the first good read. */
  private loadedAt: number | null = null
  private pending: Promise<void> | null = null
  /** Bumped on logout: an answer for an earlier session is dropped, never shown to the next person. */
  private session = 0

  /** Every tag in use, most recently used first. */
  readonly tags = this._tags.asReadonly()
  /** `loading` until the first answer; a failed reload keeps the last list `ready`. */
  readonly status = this._status.asReadonly()
  /** Tag names, most recently used first (suggestions, the filter sheet). */
  readonly names = computed(() => this._tags().map((tag) => tag.tag))

  constructor() {
    inject(SessionStore).onClear(() => {
      this.session++
      this._tags.set([])
      this._status.set('loading')
      this.loadedAt = null
      this.pending = null
    })
  }

  /** The list, read when there is none yet or the ledger changed since; calls in flight share it. */
  load(): Promise<void> {
    if (this.loadedAt !== null && this.loadedAt === this.revision()) {
      return Promise.resolve()
    }
    return this.refresh()
  }

  /** Reads the list again, whatever changed. */
  refresh(): Promise<void> {
    if (!this.pending) {
      const pending = this.fetch().finally(() => {
        // A request from before a logout must not clear the one that replaced it.
        if (this.pending === pending) {
          this.pending = null
        }
      })
      this.pending = pending
    }
    return this.pending
  }

  private async fetch(): Promise<void> {
    const session = this.session
    const revision = this.revision()
    if (this.loadedAt === null) {
      this._status.set('loading')
    }
    try {
      const tags = await this.api.list()
      if (session !== this.session) {
        return
      }
      this._tags.set(tags)
      this.loadedAt = revision
      this._status.set('ready')
    } catch {
      if (session === this.session && this.loadedAt === null) {
        this._status.set('error')
      }
    }
  }

  private revision(): number {
    return untracked(() => this.months.ledgerRevision())
  }
}
