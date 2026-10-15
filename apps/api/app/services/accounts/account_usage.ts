import type Account from '#models/account'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

/**
 * What references an account (deletion guard): ledger rows (transfer legs
 * included) and transfers. Import batches join here when they exist.
 * Resolved through the container, so tests can swap it.
 */
export default class AccountUsage {
  async transactionCount(account: Account, trx?: TransactionClientContract): Promise<number> {
    const client = trx ?? db
    const [transactions, transfers] = await Promise.all([
      client.from('transactions').where('account_id', account.id).count('* as total').first(),
      client
        .from('transfers')
        .where((query) =>
          query.where('from_account_id', account.id).orWhere('to_account_id', account.id)
        )
        .count('* as total')
        .first(),
    ])
    return Number(transactions?.total ?? 0) + Number(transfers?.total ?? 0)
  }
}
