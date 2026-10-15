import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * A transfer between two accounts of the household. The money itself lives
 * in two `transactions` rows of kind `transfer` (one leg per account, with
 * opposite signs) that point here through `transactions.transfer_id`; this
 * row only links them, so balances stay `SUM(amount_cents)` per account and
 * reports exclude transfers with `kind <> 'transfer'`.
 *
 * Account FKs use NO ACTION (checked at the end of the statement): deleting
 * an account with transfers fails, while a household delete cascades both.
 */
export default class extends BaseSchema {
  protected tableName = 'transfers'

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
      table.date('date').notNullable()
      table.integer('amount_cents').notNullable()
      table.integer('from_account_id').unsigned().notNullable().references('id').inTable('accounts')
      table.integer('to_account_id').unsigned().notNullable().references('id').inTable('accounts')
      table.string('memo', 255).nullable()
      // Idempotent POST from the PWA (retries after a flaky network).
      table.uuid('client_id').nullable()
      table
        .integer('created_by_user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      table
        .integer('updated_by_user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')

      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      table.index(['household_id', 'date'])
    })

    this.schema.raw(
      `ALTER TABLE transfers
         ADD CONSTRAINT transfers_amount_positive CHECK (amount_cents > 0),
         ADD CONSTRAINT transfers_distinct_accounts CHECK (from_account_id <> to_account_id)`
    )
    this.schema.raw(
      `CREATE UNIQUE INDEX transfers_household_client_id_unique
         ON transfers (household_id, client_id)
         WHERE client_id IS NOT NULL`
    )
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
