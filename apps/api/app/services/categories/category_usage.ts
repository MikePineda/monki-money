import type Category from '#models/category'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

/**
 * What references a category: transactions and split lines. Merchant rules
 * and staged import suggestions do not block a delete (the rules go with
 * the category, suggestions become empty) but follow a replacement.
 * Resolved through the container, so tests can swap it.
 */
export default class CategoryUsage {
  async referenceCount(category: Category, trx?: TransactionClientContract): Promise<number> {
    const client = trx ?? db
    const [transactions, splits] = await Promise.all([
      client
        .from('transactions')
        .where('household_id', category.householdId)
        .where('category_id', category.id)
        .count('* as total')
        .first(),
      client
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
    for (const table of ['transactions', 'transaction_splits', 'merchant_rules']) {
      await client
        .from(table)
        .where('household_id', from.householdId)
        .where('category_id', from.id)
        .update({ category_id: to.id, updated_at: new Date() })
    }
    await client
      .from('import_rows')
      .where('household_id', from.householdId)
      .where('suggested_category_id', from.id)
      .update({ suggested_category_id: to.id, updated_at: new Date() })
  }
}
