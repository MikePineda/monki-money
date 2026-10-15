import { Injectable, inject } from '@angular/core'
import type { EntryKind, TransactionStatus } from '@monkimoney/shared'
import { API } from '../../../core/api/api'
import type { Transaction } from '../../../core/api/api-types'
import type { TransactionListQuery } from '../../../domain/transaction-filters'

/** One page of `GET /transactions`. */
export interface TransactionPage {
  rows: Transaction[]
  page: number
  lastPage: number
  total: number
}

/** `POST /transactions`: amounts positive, the kind gives the sign. */
export interface TransactionCreateInput {
  clientId?: string
  accountId: number
  kind: EntryKind
  date: string
  amountCents: number
  categoryId?: number | null
  splits?: { categoryId: number; amountCents: number; memo?: string | null }[]
  payee?: string | null
  description?: string | null
  paidByUserId?: number | null
  status?: TransactionStatus
  isPrivate?: boolean
  tags?: string[]
}

/** `PATCH /transactions/:id`: any subset of the fields. */
export type TransactionPatch = Partial<
  Pick<
    TransactionCreateInput,
    | 'accountId'
    | 'kind'
    | 'date'
    | 'amountCents'
    | 'categoryId'
    | 'payee'
    | 'description'
    | 'paidByUserId'
    | 'status'
    | 'isPrivate'
    | 'tags'
  >
> & { needsReview?: boolean }

interface PageMeta {
  total: number
  currentPage: number
  lastPage: number
}

/**
 * Data access for expenses and income (`/transactions`). Transfer legs are
 * read here too, but they change only through `TransfersApi`.
 */
@Injectable({ providedIn: 'root' })
export class TransactionsApi {
  private readonly api = inject(API)

  async list(query: TransactionListQuery, signal?: AbortSignal): Promise<TransactionPage> {
    const body = await (await this.api()).request('transactions.index', { query, signal })
    const meta = (body as unknown as { metadata: PageMeta }).metadata
    return {
      rows: body.data,
      page: meta.currentPage,
      lastPage: meta.lastPage,
      total: meta.total,
    }
  }

  /** Both legs of a transfer, found among that day's transfer rows. */
  async transferLegs(transferId: number, date: string): Promise<Transaction[]> {
    const body = await (
      await this.api()
    ).request('transactions.index', {
      query: { kind: 'transfer', from: date, to: date, perPage: 100 },
    })
    return body.data.filter((row) => row.transferId === transferId)
  }

  async show(id: number): Promise<Transaction> {
    const { data } = await (await this.api()).request('transactions.show', { params: { id } })
    return data
  }

  async create(body: TransactionCreateInput): Promise<Transaction> {
    const { data } = await (await this.api()).request('transactions.store', { body })
    return data
  }

  async update(id: number, body: TransactionPatch): Promise<Transaction> {
    const { data } = await (
      await this.api()
    ).request('transactions.update', { params: { id }, body })
    return data
  }

  async remove(id: number): Promise<void> {
    await (await this.api()).request('transactions.destroy', { params: { id } })
  }

  /** Replaces the split lines (they must add up); no lines = a single category again. */
  async updateSplits(
    id: number,
    body: { splits: { categoryId: number; amountCents: number }[]; categoryId?: number | null }
  ): Promise<Transaction> {
    const { data } = await (
      await this.api()
    ).request('transactions.splits.update', { params: { id }, body })
    return data
  }
}
