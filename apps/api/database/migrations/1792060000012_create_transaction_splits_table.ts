import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Lines of a split transaction (Actual Budget model): each line has its
 * own category and signed amount; the lines sum to the parent's
 * `amount_cents` (service invariant, `validateSplits`). Reports count the
 * lines, never the parent.
 *
 * `household_id` repeats the parent's on purpose: every resource hangs from
 * its household, and a household delete must reach the lines in its first
 * cascade level. Through the parent alone, Postgres checks the NO ACTION
 * category FK before the second-level cascade removes the lines, and the
 * delete fails.
 */
export default class extends BaseSchema {
  protected tableName = 'transaction_splits'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('household_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('households')
        .onDelete('CASCADE')
      table
        .integer('transaction_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('transactions')
        .onDelete('CASCADE')
      table.integer('category_id').unsigned().notNullable().references('id').inTable('categories')
      table.integer('amount_cents').notNullable()
      table.string('memo', 255).nullable()
      table.integer('sort_order').notNullable().defaultTo(0)

      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      table.index(['transaction_id', 'sort_order'])
      table.index(['household_id', 'category_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
