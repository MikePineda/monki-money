import type Category from '#models/category'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

/**
 * What references a category: transactions and split lines (merchant rules
 * join here when they exist). Resolved through the container, so tests can
 * swap it.
 */
export default class CategoryUsage {
  async referenceCount(category: Category): Promise<number> {
    const [transactions, splits] = await Promise.all([
      db
        .from('transactions')
        .where('household_id', category.householdId)
        .where('category_id', category.id)
        .count('* as total')
        .first(),
      db
        .from('transaction_splits')
        .where('household_id', category.householdId)
        .where('category_id', category.id)
        .count('* as total')
        .first(),
    ])
    return Number(transactions?.total ?? 0) + Number(splits?.total ?? 0)
  }

  /** Moves every reference from `from` to `to` inside `trx`. */
  async reassign(from: Category, to: Category, trx?: TransactionClientContract): Promise<void> {
    const client = trx ?? db
    for (const table of ['transactions', 'transaction_splits']) {
      await client
        .from(table)
        .where('household_id', from.householdId)
        .where('category_id', from.id)
        .update({ category_id: to.id, updated_at: new Date() })
    }
  }
}
