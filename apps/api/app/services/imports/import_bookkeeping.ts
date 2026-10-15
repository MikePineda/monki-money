import type Account from '#models/account'
import db from '@adonisjs/lucid/services/db'
import type ImportBatch from '#models/import_batch'
import type { ImportResolution } from '@monkimoney/shared'
import type {
  QueryClientContract,
  TransactionClientContract,
} from '@adonisjs/lucid/types/database'

/** Batch count column per row resolution (duplicates are counted at staging only). */
const COUNT_COLUMNS: Partial<Record<ImportResolution, keyof ImportBatch>> = {
  new: 'newCount',
  auto_matched: 'matchedCount',
  needs_confirmation: 'confirmationCount',
  transfer_leg: 'transferCount',
  ignored: 'ignoredCount',
  superseded: 'supersededCount',
}

/**
 * Numbers kept on `import_batches`: counts by resolution (after staging,
 * every decision, confirm and cancel) and the ledger balance the bank's
 * balance is reconciled against.
 */
export default class ImportBookkeeping {
  /** Re-counts the batch's stored rows by resolution and saves the batch. */
  async refreshCounts(batch: ImportBatch, client: QueryClientContract = db) {
    const counts: Array<{ resolution: ImportResolution; total: number }> = await client
      .from('import_rows')
      .where('import_batch_id', batch.id)
      .groupBy('resolution')
      .select('resolution')
      .count('* as total')

    const values: Record<string, number> = Object.fromEntries(
      Object.values(COUNT_COLUMNS).map((column) => [column, 0])
    )
    for (const row of counts) {
      const column = COUNT_COLUMNS[row.resolution]
      if (column) values[column] = Number(row.total)
    }
    batch.merge(values)
    if (client.isTransaction) batch.useTransaction(client as TransactionClientContract)
    await batch.save()
  }

  /**
   * Opening balance + every ledger row of the account the bank had seen by
   * `asOf` (bank date, or the date of rows typed by hand). Pending rows
   * count: the bank's running balance includes them.
   */
  async ledgerBalance(
    account: Pick<Account, 'id' | 'openingBalanceCents'>,
    asOf: string,
    options: { openingBalanceCents?: number; client?: QueryClientContract } = {}
  ): Promise<number> {
    const client = options.client ?? db
    const row = await client
      .from('transactions')
      .where('account_id', account.id)
      .whereRaw('COALESCE(bank_date, date) <= ?', [asOf])
      .sum('amount_cents as total')
      .first()
    const opening = options.openingBalanceCents ?? account.openingBalanceCents
    return opening + Number(row?.total ?? 0)
  }
}
