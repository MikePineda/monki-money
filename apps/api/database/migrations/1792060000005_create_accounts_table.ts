import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Money accounts of a household. `owner_user_id` NULL means joint.
 * `external_account_number` is the bank's account number as it appears in
 * CSV exports; it is unique per household when present (partial index).
 */
export default class extends BaseSchema {
  protected tableName = 'accounts'

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
        .integer('owner_user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      table.string('name', 80).notNullable()
      table.string('institution', 40).nullable()
      table
        .enum('kind', ['transaction', 'savings', 'wallet', 'cash', 'other'], {
          useNative: true,
          enumName: 'account_kind',
          existingType: false,
        })
        .notNullable()
      table.specificType('currency_code', 'char(3)').notNullable().defaultTo('AUD')
      table.string('external_account_number', 64).nullable()
      table.integer('opening_balance_cents').notNullable().defaultTo(0)
      table.date('opening_balance_date').nullable()
      table.boolean('is_active').notNullable().defaultTo(true)
      table.integer('sort_order').notNullable().defaultTo(0)
      table
        .integer('created_by_user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')

      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      table.index(['household_id', 'sort_order'])
    })

    this.schema.raw(
      `CREATE UNIQUE INDEX accounts_household_external_number_unique
         ON accounts (household_id, external_account_number)
         WHERE external_account_number IS NOT NULL`
    )
  }

  async down() {
    this.schema.dropTable(this.tableName)
    this.schema.raw('DROP TYPE IF EXISTS account_kind')
  }
}
