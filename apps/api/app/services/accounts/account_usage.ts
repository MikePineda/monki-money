import type Account from '#models/account'

/**
 * What references an account (deletion guard). The ledger (transactions,
 * transfers, import batches) arrives in a later package and plugs its
 * counts in here; until then nothing can reference an account. Resolved
 * through the container, so tests can swap it.
 */
export default class AccountUsage {
  async transactionCount(_account: Account): Promise<number> {
    return 0
  }
}
