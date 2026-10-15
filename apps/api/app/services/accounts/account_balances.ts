import type Account from '#models/account'
import type { AccountBalance } from '#services/accounts/dto'

/**
 * Balances per account. Until the ledger exists the balance is the opening
 * balance; the ledger package replaces this with opening + SUM(postings),
 * cleared (status = cleared) vs available (pending included).
 */
export default class AccountBalances {
  async forAccounts(accounts: Account[]): Promise<Map<number, AccountBalance>> {
    return new Map(
      accounts.map((account) => [
        account.id,
        {
          clearedBalanceCents: account.openingBalanceCents,
          availableBalanceCents: account.openingBalanceCents,
        },
      ])
    )
  }
}
