import type Account from '#models/account'
import db from '@adonisjs/lucid/services/db'

/**
 * What references an account (deletion guard): ledger rows (transfer legs
 * included) and transfers. Import batches join here when they exist.
 * Resolved through the container, so tests can swap it.
 */
export default class AccountUsage {
  async transactionCount(account: Account): Promise<number> {
    const [transactions, transfers] = await Promise.all([
      db.from('transactions').where('account_id', account.id).count('* as total').first(),
      db
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
