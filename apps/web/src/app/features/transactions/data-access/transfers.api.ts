import { Injectable, inject } from '@angular/core'
import { API } from '../../../core/api/api'
import type { Transfer } from '../../../core/api/api-types'

/** `POST /transfers`: a positive amount between two different accounts. */
export interface TransferInput {
  clientId?: string
  fromAccountId: number
  toAccountId: number
  date: string
  amountCents: number
  memo?: string | null
  /** Written on both legs. */
  tags?: string[]
}

/**
 * Data access for transfers between the household's accounts. A transfer
 * is two ledger rows (legs); these calls always write both.
 */
@Injectable({ providedIn: 'root' })
export class TransfersApi {
  private readonly api = inject(API)

  /** Both legs (masked for the reader) and the memo in one call. */
  async show(id: number): Promise<Transfer> {
    const { data } = await (await this.api()).request('transfers.show', { params: { id } })
    return data
  }

  async create(body: TransferInput): Promise<Transfer> {
    const { data } = await (await this.api()).request('transfers.store', { body })
    return data
  }

  async update(id: number, body: Partial<TransferInput>): Promise<Transfer> {
    const { data } = await (await this.api()).request('transfers.update', { params: { id }, body })
    return data
  }

  async remove(id: number): Promise<void> {
    await (await this.api()).request('transfers.destroy', { params: { id } })
  }
}
