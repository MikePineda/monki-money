import type Account from '#models/account'
import { addDays } from '#domain/importing/iso_days'
import db from '@adonisjs/lucid/services/db'
import type ImportBatch from '#models/import_batch'
import type { ImportResolution } from '@monkimoney/shared'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

/** An account's opening balance: the balance at the end of `date` (null = before everything). */
export interface Opening {
  cents: number
  date: string | null
}

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
  async refreshCounts(batch: ImportBatch, trx?: TransactionClientContract) {
    const counts: Array<{ resolution: ImportResolution; total: number }> = await (trx ?? db)
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
    if (trx) batch.useTransaction(trx)
    await batch.save()
  }

  /**
   * Opening balance + every ledger row of the account the bank had seen by
   * `asOf` (bank date, or the date of rows typed by hand), like
   * AccountBalances: rows dated on or before the opening date are already
   * inside the opening balance. Pending rows count: the bank's running
   * balance includes them. `opening` replaces the account's own (a first
   * import that has not set it yet).
   */
  async ledgerBalance(
    account: Pick<Account, 'id' | 'openingBalanceCents' | 'openingBalanceDate'>,
    asOf: string,
    options: { opening?: Opening; client?: TransactionClientContract } = {}
  ): Promise<number> {
    const client = options.client ?? db
    const opening = options.opening ?? {
      cents: account.openingBalanceCents,
      date: account.openingBalanceDate,
    }
    const row = await client
      .from('transactions')
      .where('account_id', account.id)
      .whereRaw('COALESCE(bank_date, date) <= ?', [asOf])
      .if(opening.date, (query) => query.where('date', '>', opening.date!))
      .sum('amount_cents as total')
      .first()
    return opening.cents + Number(row?.total ?? 0)
  }

  /**
   * The opening balance a first import derives: the balance before the
   * oldest bank row, as of the day before the earliest date of the batch
   * (purchase or posting) or of the ledger rows its rows were linked to on
   * confirm (a hand entry dated before its bank copy), so every one of them
   * counts after it. Call it after the rows were applied.
   */
  async derivedOpening(batch: ImportBatch, trx?: TransactionClientContract): Promise<Opening> {
    const client = trx ?? db
    const row = await client
      .from('import_rows')
      .leftJoin('transactions', 'transactions.id', 'import_rows.transaction_id')
      .where('import_rows.import_batch_id', batch.id)
      .select(
        client.raw(
          `LEAST(MIN(LEAST(import_rows.date, import_rows.bank_date)), MIN(transactions.date)) AS earliest`
        )
      )
      .first()
    const earliest: string = row?.earliest ?? batch.dateFrom!
    return { cents: batch.openingBalanceCents ?? 0, date: addDays(earliest, -1) }
  }
}
