import type Account from '#models/account'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

/**
 * What references an account (deletion guard): ledger rows (transfer legs
 * included), transfers and savings goals. Import batches and the rules that
 * point at the account do not block it: they are deleted with it (FK
 * cascade). Resolved through the container, so tests can swap it.
 */
export default class AccountUsage {
  async referenceCount(account: Account, trx?: TransactionClientContract): Promise<number> {
    const client = trx ?? db
    const counts = await Promise.all([
      client.from('transactions').where('account_id', account.id).count('* as total').first(),
      client
        .from('transfers')
        .where((query) =>
          query.where('from_account_id', account.id).orWhere('to_account_id', account.id)
        )
        .count('* as total')
        .first(),
      client.from('savings_goals').where('account_id', account.id).count('* as total').first(),
    ])
    return counts.reduce((total, row) => total + Number(row?.total ?? 0), 0)
  }
}
