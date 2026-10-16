import { Injectable, inject } from '@angular/core'
import type { TransactionSuggestions } from '@monkimoney/shared'
import { API } from '../api/api'
import type { Transaction, Transfer } from '../api/api-types'

export type EntryKind = 'expense' | 'income'

/** `POST /transactions/quick`: only the amount is required; the rest has server defaults. */
export interface QuickEntryInput {
  /** Idempotency key: a retry with the same id answers the row it already created. */
  clientId: string
  amountCents: number
  kind?: EntryKind
  accountId?: number
  date?: string
  categoryId?: number | null
  payee?: string | null
  description?: string | null
  /** null = joint ("both of us"). */
  paidByUserId?: number | null
  isPrivate?: boolean
  tags?: string[]
}

/** `POST /transfers`: money moved between two of the household's accounts. */
export interface TransferInput {
  clientId: string
  fromAccountId: number
  toAccountId: number
  date: string
  amountCents: number
  memo?: string | null
}

/**
 * Data access for quick add: its server rankings, saving, undo. Thin:
 * every method is one typed Tuyau call.
 */
@Injectable({ providedIn: 'root' })
export class TransactionsApi {
  private readonly api = inject(API)

  /** `GET /transactions/suggestions`: categories, payees, routes and the last account, ranked. */
  async suggestions(): Promise<TransactionSuggestions> {
    const { data } = await (await this.api()).request('transactions.suggestions', {})
    return data
  }

  async quick(body: QuickEntryInput): Promise<Transaction> {
    const { data } = await (await this.api()).request('transactions.quick', { body })
    return data
  }

  async remove(id: number): Promise<void> {
    await (await this.api()).request('transactions.destroy', { params: { id } })
  }

  async transfer(body: TransferInput): Promise<Transfer> {
    const { data } = await (await this.api()).request('transfers.store', { body })
    return data
  }

  async removeTransfer(id: number): Promise<void> {
    await (await this.api()).request('transfers.destroy', { params: { id } })
  }
}
