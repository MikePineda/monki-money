import { Injectable, inject } from '@angular/core'
import type { TransactionSuggestions } from '@monkimoney/shared'
import { SessionStore } from '../../../core/auth/session.store'
import { TransactionsApi } from '../../../core/ledger/transactions.api'
import { OfflineCache } from '../../../core/platform/offline-cache'

/**
 * Quick add's rankings from the server (`GET /transactions/suggestions`):
 * every visit asks again, and every answer is also kept on the device
 * (OfflineCache, tied to the person and household). Offline, or when the
 * request fails, quick add opens with the last answer this session got,
 * else with the one kept on the device (an app started offline ranks as it
 * last did), else with none. Forgotten on logout, also when a request was
 * still on its way.
 */
@Injectable({ providedIn: 'root' })
export class SuggestionsStore {
  private readonly api = inject(TransactionsApi)
  private readonly sessionStore = inject(SessionStore)
  private readonly cache = inject(OfflineCache)

  private last: TransactionSuggestions | null = null
  /** Bumped on logout: an answer for the previous session is dropped. */
  private session = 0

  constructor() {
    this.sessionStore.onClear(() => {
      this.session++
      this.last = null
    })
  }

  async load(): Promise<TransactionSuggestions | null> {
    const session = this.session
    try {
      const fresh = await this.api.suggestions()
      if (session === this.session) {
        this.last = fresh
        this.keep(fresh)
      }
    } catch {
      // Offline or failing: whatever this session (or this device) already had.
      if (session === this.session && this.last === null) {
        this.last = this.kept()
      }
    }
    return session === this.session ? this.last : null
  }

  private owner(): { userId: number; householdId: number } | null {
    const me = this.sessionStore.me()
    const userId = me?.user.id
    const householdId = me?.household?.id
    return userId === undefined || householdId === undefined ? null : { userId, householdId }
  }

  private keep(suggestions: TransactionSuggestions): void {
    const owner = this.owner()
    if (owner) {
      this.cache.writeSuggestions(owner.userId, owner.householdId, suggestions)
    }
  }

  private kept(): TransactionSuggestions | null {
    const owner = this.owner()
    return owner ? this.cache.readSuggestions(owner.userId, owner.householdId) : null
  }
}
