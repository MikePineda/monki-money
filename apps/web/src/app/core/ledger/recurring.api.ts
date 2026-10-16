import { Injectable, inject } from '@angular/core'
import { API } from '../api/api'
import type { RecurringItem } from '../api/api-types'
import type { MerchantSuggestion, RecurringFields, RecurringPatch } from '../../domain/recurring'

/**
 * Data access for the household's recurring payments (rent, phone, gym,
 * subscriptions). Shared by the Month view ("Detect recurring payments")
 * and the `/recurring` screen. Another household's id is a 404.
 */
@Injectable({ providedIn: 'root' })
export class RecurringApi {
  private readonly api = inject(API)

  /** `GET /recurring`: active first, then paused and dismissed; each by next due date. */
  async list(): Promise<RecurringItem[]> {
    const { data } = await (await this.api()).request('recurring.index', {})
    return data
  }

  /** `GET /recurring/merchants`: merchants paid lately that no item tracks, most paid first. */
  async merchants(): Promise<MerchantSuggestion[]> {
    const { data } = await (await this.api()).request('recurring.merchants', {})
    return data
  }

  /**
   * `POST /recurring`: one added by hand, keyed by a suggestion's
   * `merchantKey` when one was picked, else by the payee.
   */
  async create(body: RecurringFields & { merchantKey?: string }): Promise<RecurringItem> {
    const { data } = await (await this.api()).request('recurring.store', { body })
    return data
  }

  /** `PATCH /recurring/:id`: what changed, the status included (pause, resume, dismiss). */
  async update(id: number, body: RecurringPatch): Promise<RecurringItem> {
    const { data } = await (await this.api()).request('recurring.update', { params: { id }, body })
    return data
  }

  async remove(id: number): Promise<void> {
    await (await this.api()).request('recurring.destroy', { params: { id } })
  }

  /** `POST /recurring/detect`: looks for recurring payments in the last twelve months. */
  async detect(): Promise<{ created: number; updated: number }> {
    const { data } = await (await this.api()).request('recurring.detect', {})
    return data
  }
}
