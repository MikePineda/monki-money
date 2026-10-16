import { Injectable, inject } from '@angular/core'
import type { TransactionSuggestions } from '@monkimoney/shared'
import { SessionStore } from '../../../core/auth/session.store'
import { TransactionsApi } from '../../../core/ledger/transactions.api'

/**
 * Quick add's rankings from the server (`GET /transactions/suggestions`):
 * every visit asks again; offline, or when the request fails, quick add
 * opens with the last answer this session got (or with none). Forgotten on
 * logout, also when a request was still on its way.
 */
@Injectable({ providedIn: 'root' })
export class SuggestionsStore {
  private readonly api = inject(TransactionsApi)

  private last: TransactionSuggestions | null = null
  /** Bumped on logout: an answer for the previous session is dropped. */
  private session = 0

  constructor() {
    inject(SessionStore).onClear(() => {
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
      }
    } catch {
      // Offline or failing: whatever this session already had.
    }
    return session === this.session ? this.last : null
  }
}
