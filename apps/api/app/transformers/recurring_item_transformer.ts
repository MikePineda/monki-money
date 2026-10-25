import type RecurringItem from '#models/recurring_item'
import { BaseTransformer } from '@adonisjs/core/transformers'
import { isoTimestamp } from '#domain/time/iso_timestamp'
import { pausedByDetection } from '#domain/recurring/redetection'
import { confidenceOf } from '#domain/recurring/detection'

/**
 * A recurring payment. `amountCents` is the typical amount (positive);
 * `merchantKey` is what payments match (fixed at creation, `payee` is only
 * its name); `paidByUserId` null = joint. `pausedByDetection`: paused
 * because its payments stopped (a person did not pause it). `confidence`:
 * `low` for a detected yearly bill seen only twice (check it), else `high`.
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
      pausedByDetection: pausedByDetection(item),
      source: item.source,
      occurrences: item.occurrences,
      confidence: confidenceOf(item),
      createdAt: isoTimestamp(item.createdAt)!,
      updatedAt: isoTimestamp(item.updatedAt)!,
    }
  }
}
