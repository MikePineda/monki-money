import { Injectable, inject } from '@angular/core'
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

/** `GET /transactions` filters (see docs/CONTRACTS.md). */
export interface TransactionQuery {
  month?: string
  kind?: 'expense' | 'income' | 'transfer'
  sort?: 'date' | '-date' | 'amount' | '-amount'
  page?: number
  perPage?: number
}

/**
 * Data access for ledger rows and transfers (quick add, the month's top
 * transactions, undo). Thin: every method is one typed Tuyau call.
 */
@Injectable({ providedIn: 'root' })
export class TransactionsApi {
  private readonly api = inject(API)

  /** One page of rows (newest first unless `sort` says otherwise). */
  async list(query: TransactionQuery = {}): Promise<Transaction[]> {
    const { data } = await (await this.api()).request('transactions.index', { query })
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
