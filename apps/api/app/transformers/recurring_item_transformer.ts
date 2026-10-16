import type RecurringItem from '#models/recurring_item'
import { BaseTransformer } from '@adonisjs/core/transformers'
import { isoTimestamp } from '#domain/time/iso_timestamp'

/**
 * A recurring payment. `amountCents` is the typical amount (positive);
 * `merchantKey` is what payments match (fixed at creation, `payee` is only
 * its name); `paidByUserId` null = joint.
 */
export default class RecurringItemTransformer extends BaseTransformer<RecurringItem> {
  toObject() {
    const item = this.resource
    return {
      id: item.id,
      payee: item.payee,
      merchantKey: item.merchantKey,
      cadence: item.cadence,
      amountCents: item.amountCents,
      amountTolerancePct: item.amountTolerancePct,
      categoryId: item.categoryId,
      accountId: item.accountId,
      paidByUserId: item.paidByUserId,
      lastPaidDate: item.lastPaidDate,
      nextExpectedDate: item.nextExpectedDate,
      status: item.status,
      source: item.source,
      occurrences: item.occurrences,
      createdAt: isoTimestamp(item.createdAt)!,
      updatedAt: isoTimestamp(item.updatedAt)!,
    }
  }
}
