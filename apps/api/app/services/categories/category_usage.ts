import type Category from '#models/category'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

/**
 * What references a category (transactions, splits, rules). The ledger and
 * rules packages plug their tables in here; until then nothing does.
 * Resolved through the container, so tests can swap it.
 */
export default class CategoryUsage {
  async referenceCount(_category: Category): Promise<number> {
    return 0
  }

  /** Moves every reference from `from` to `to` inside `trx`. */
  async reassign(_from: Category, _to: Category, _trx?: TransactionClientContract): Promise<void> {}
}
