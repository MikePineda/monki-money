import type ImportBatch from '#models/import_batch'
import { reconcile } from '#domain/importing/review'
import { BaseTransformer } from '@adonisjs/core/transformers'
import { isoTimestamp } from '#domain/time/iso_timestamp'

/**
 * An import batch: one account's rows of one upload. `counts` are by row
 * resolution (`rows` = every row of the file for the account, duplicates
 * included); `reconciliation` compares the bank's balance on the newest row
 * with the ledger's (projected while staged, measured once confirmed).
 * `classifying` is true while a classify run holds the batch;
 * `classifiedAt` says when the last one ended.
 */
export default class ImportBatchTransformer extends BaseTransformer<ImportBatch> {
  toObject() {
    const batch = this.resource
    return {
      id: batch.id,
      accountId: batch.accountId,
      status: batch.status,
      source: batch.source,
      fileName: batch.fileName,
      archived: batch.filePath !== null,
      dateFrom: batch.dateFrom,
      dateTo: batch.dateTo,
      counts: {
        rows: batch.rowCount,
        new: batch.newCount,
        autoMatched: batch.matchedCount,
        needsConfirmation: batch.confirmationCount,
        duplicate: batch.duplicateCount,
        transferLeg: batch.transferCount,
        ignored: batch.ignoredCount,
        superseded: batch.supersededCount,
      },
      reconciliation: reconcile({
        asOf: batch.dateTo,
        dateFrom: batch.dateFrom,
        expectedBalanceCents: batch.expectedBalanceCents,
        computedBalanceCents: batch.computedBalanceCents,
        openingBalanceCents: batch.openingBalanceCents,
      }),
      classifying: batch.isClassifying,
      classifiedAt: isoTimestamp(batch.classifyFinishedAt),
      uploadedByUserId: batch.uploadedByUserId,
      createdAt: isoTimestamp(batch.createdAt)!,
      completedAt: isoTimestamp(batch.completedAt),
    }
  }
}
