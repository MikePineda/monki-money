import type Account from '#models/account'
import db from '@adonisjs/lucid/services/db'
import type { TransactionStatus } from '@monkimoney/shared'
import { accountBalance } from '#domain/ledger/balances'
import type { AccountBalance } from '#services/accounts/dto'

/**
 * Balances per account: opening balance + SUM(amount_cents) of every
 * ledger row of the account (transfer legs included). `cleared` counts
 * settled rows only, `available` pending ones too. One grouped query for
 * all the accounts.
 */
export default class AccountBalances {
  async forAccounts(accounts: Account[]): Promise<Map<number, AccountBalance>> {
    if (accounts.length === 0) return new Map()

    const totals: Array<{ account_id: number; status: TransactionStatus; total: number }> = await db
      .from('transactions')
      .whereIn(
        'account_id',
        accounts.map((account) => account.id)
      )
      .groupBy('account_id', 'status')
      .select('account_id', 'status')
      .sum('amount_cents as total')

    return new Map(
      accounts.map((account) => [
        account.id,
        accountBalance(
          account.openingBalanceCents,
          totals
            .filter((row) => row.account_id === account.id)
            .map((row) => ({ amountCents: Number(row.total), status: row.status }))
        ),
      ])
    )
  }
}
