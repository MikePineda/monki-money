import { BaseTransformer } from '@adonisjs/core/transformers'
import { isoTimestamp } from '#domain/time/iso_timestamp'
import type { LinkedHolderSummary } from '#services/imports/linked_holders'

/**
 * A linked holder (the person NAB names on internal transfers) with the
 * accounts its transfers were confirmed to. Each account entry's `id` is
 * the pair `DELETE /household/linked-holders/:id` forgets.
 */
export default class LinkedHolderTransformer extends BaseTransformer<LinkedHolderSummary> {
  toObject() {
    return {
      holderKey: this.resource.holderKey,
      holderName: this.resource.holderName,
      confirmedCount: this.resource.confirmedCount,
      lastConfirmedAt: isoTimestamp(this.resource.lastConfirmedAt)!,
      accounts: this.resource.accounts.map((pair) => ({
        id: pair.id,
        accountId: pair.accountId,
        confirmedCount: pair.confirmedCount,
        lastConfirmedAt: isoTimestamp(pair.lastConfirmedAt)!,
      })),
    }
  }
}
