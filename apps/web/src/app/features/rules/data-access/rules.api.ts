import { Injectable, inject } from '@angular/core'
import type { RuleMatchType } from '@monkimoney/shared'
import { API } from '../../../core/api/api'
import type { MerchantRule } from '../../../core/api/api-types'

/**
 * The body of `POST /rules` (all optional on `PATCH /rules/:id`). Exactly
 * one of `categoryId` / `transferAccountId` is set; `paidByUserId` and
 * `payeeOverride` null mean "leave it as imported".
 */
export interface RuleInput {
  matchType: RuleMatchType
  pattern: string
  categoryId?: number | null
  transferAccountId?: number | null
  paidByUserId?: number | null
  payeeOverride?: string | null
  priority?: number
}

/**
 * Data access for merchant rules (`/rules`). Rules are learned by the
 * import and transaction flows (`applyToFuture`) or typed by a person on
 * the rules screen, which also edits, deletes and applies them.
 */
@Injectable({ providedIn: 'root' })
export class RulesApi {
  private readonly api = inject(API)

  /** Every rule, highest priority first. */
  async list(): Promise<MerchantRule[]> {
    const { data } = await (await this.api()).request('rules.index', {})
    return data
  }

  /** A rule typed by a person (`origin: 'user'`). */
  async create(body: RuleInput): Promise<MerchantRule> {
    const { data } = await (await this.api()).request('rules.store', { body })
    return data
  }

  /** Changes some fields; the rule becomes the person's (`origin: 'user'`). */
  async update(id: number, body: Partial<RuleInput>): Promise<MerchantRule> {
    const { data } = await (await this.api()).request('rules.update', { params: { id }, body })
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
