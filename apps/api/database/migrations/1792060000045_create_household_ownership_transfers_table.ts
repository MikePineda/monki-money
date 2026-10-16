import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Audit log of ownership transfers (`POST /household/transfer-ownership`):
 * who handed the household over (`from_user_id`), to whom (`to_user_id`)
 * and when (`created_at`). Rows are only ever inserted, in the same
 * transaction that swaps the two roles. The user ids go NULL when an
 * account is deleted; the row stays as the record that a transfer happened.
 *
 * Additive: older app versions never read this table.
 */
export default class extends BaseSchema {
  protected tableName = 'household_ownership_transfers'

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
        .integer('from_user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      table
        .integer('to_user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')

      table.timestamp('created_at', { useTz: true }).notNullable()

      table.index(['household_id', 'created_at'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
