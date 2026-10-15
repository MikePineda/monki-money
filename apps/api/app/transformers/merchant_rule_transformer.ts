import type MerchantRule from '#models/merchant_rule'
import { BaseTransformer } from '@adonisjs/core/transformers'
import { isoTimestamp } from '#domain/time/iso_timestamp'

/** A household rule for bank rows (`origin`: user, learned or system). */
export default class MerchantRuleTransformer extends BaseTransformer<MerchantRule> {
  toObject() {
    const rule = this.resource
    return {
      id: rule.id,
      matchType: rule.matchType,
      pattern: rule.pattern,
      categoryId: rule.categoryId,
      transferAccountId: rule.transferAccountId,
      paidByUserId: rule.paidByUserId,
      payeeOverride: rule.payeeOverride,
      priority: rule.priority,
      origin: rule.origin,
      hitCount: rule.hitCount,
      lastHitAt: isoTimestamp(rule.lastHitAt),
      createdAt: isoTimestamp(rule.createdAt)!,
      updatedAt: isoTimestamp(rule.updatedAt)!,
    }
  }
}
