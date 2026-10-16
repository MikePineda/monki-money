import ImportRow from '#models/import_row'
import type ImportBatch from '#models/import_batch'
import { effectiveRow } from '#services/imports/effective_row'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

/**
 * The ledger row every open `auto_matched` row of a batch claims (the
 * person's pick, else the matcher's), read once per bulk request and kept
 * current as its changes apply: "one bank row per transaction" is checked
 * in memory instead of reading the batch again for every change.
 */
export default class MatchClaims {
  /** Row id -> claimed transaction id. */
  private readonly byRow = new Map<number, number>()
  /** Transaction id -> rows claiming it. */
  private readonly byTransaction = new Map<number, Set<number>>()

  /** The claims of the batch's open matched rows (inside the request's transaction). */
  static async of(batch: ImportBatch, trx: TransactionClientContract): Promise<MatchClaims> {
    const rows = await ImportRow.query({ client: trx })
      .where('import_batch_id', batch.id)
      .whereNull('confirmed_at')
      .where('resolution', 'auto_matched')
    const claims = new MatchClaims()
    for (const row of rows) claims.track(row)
    return claims
  }

  /** Another row of the batch already claims the transaction. */
  claimedByAnother(rowId: number, transactionId: number): boolean {
    const holders = this.byTransaction.get(transactionId)
    if (!holders) return false
    return holders.size > (holders.has(rowId) ? 1 : 0)
  }

  /** Records what the row claims now (nothing once it is no longer an open match). */
  track(row: ImportRow): void {
    const previous = this.byRow.get(row.id)
    if (previous !== undefined) {
      this.byTransaction.get(previous)?.delete(row.id)
      this.byRow.delete(row.id)
    }
    const transactionId = effectiveRow(row).matchTransactionId
    if (!row.isOpen || row.resolution !== 'auto_matched' || transactionId === null) return
    this.byRow.set(row.id, transactionId)
    const holders = this.byTransaction.get(transactionId) ?? new Set<number>()
    holders.add(row.id)
    this.byTransaction.set(transactionId, holders)
  }
}
