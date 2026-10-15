import { Injectable, inject } from '@angular/core'
import { API } from '../../../core/api/api'
import type { MerchantRule } from '../../../core/api/api-types'

/**
 * Data access for merchant rules (`/rules`). Rules are created by the
 * import and transaction flows (`applyToFuture`); this screen lists them,
 * deletes them and applies one to the transactions still in review.
 */
@Injectable({ providedIn: 'root' })
export class RulesApi {
  private readonly api = inject(API)

  /** Every rule, highest priority first. */
  async list(): Promise<MerchantRule[]> {
    const { data } = await (await this.api()).request('rules.index', {})
    return data
  }

  async remove(id: number): Promise<void> {
    await (await this.api()).request('rules.destroy', { params: { id } })
  }

  /** Categorizes the transactions in review the rule matches; resolves with how many. */
  async apply(id: number): Promise<number> {
    const { data } = await (await this.api()).request('rules.apply', { params: { id } })
    return data.updated
  }
}
