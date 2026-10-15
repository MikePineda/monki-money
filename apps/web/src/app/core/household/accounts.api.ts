import { Injectable, inject } from '@angular/core'
import type { AccountKind } from '@monkimoney/shared'
import { API } from '../api/api'

export interface AccountInput {
  name: string
  kind: AccountKind
  institution?: string | null
  /** null = joint account. */
  ownerUserId?: number | null
  isActive?: boolean
  /** The bank's account number, as bank exports print it (CSV imports map rows by it). */
  externalAccountNumber?: string | null
}

/** Data access for the household's accounts and their cards. */
@Injectable({ providedIn: 'root' })
export class AccountsApi {
  private readonly api = inject(API)

  async list() {
    const { data } = await (await this.api()).request('accounts.index', {})
    return data
  }

  async create(body: AccountInput) {
    const { data } = await (await this.api()).request('accounts.store', { body })
    return data
  }

  async update(id: number, body: Partial<AccountInput>) {
    const { data } = await (await this.api()).request('accounts.update', { params: { id }, body })
    return data
  }

  async remove(id: number): Promise<void> {
    await (await this.api()).request('accounts.destroy', { params: { id } })
  }

  async addCard(accountId: number, body: { cardSuffix: string; userId?: number | null }) {
    const { data } = await (
      await this.api()
    ).request('accounts.cards.store', {
      params: { id: accountId },
      body,
    })
    return data
  }

  async removeCard(accountId: number, cardId: number): Promise<void> {
    await (
      await this.api()
    ).request('accounts.cards.destroy', { params: { id: accountId, cardId } })
  }
}
