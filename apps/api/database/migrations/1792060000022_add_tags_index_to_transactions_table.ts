import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Tag filtering and per-tag totals read `transactions.tags @> '["<tag>"]'`
 * (jsonb containment). A GIN index with `jsonb_path_ops` serves exactly
 * that operator and stays small. Additive: nothing reads it by name.
 */
export default class extends BaseSchema {
  protected tableName = 'transactions'

  async up() {
    this.schema.raw(
      `CREATE INDEX IF NOT EXISTS transactions_tags_gin_index
         ON transactions USING GIN (tags jsonb_path_ops)`
    )
  }

  async down() {
    this.schema.raw('DROP INDEX IF EXISTS transactions_tags_gin_index')
  }
}
