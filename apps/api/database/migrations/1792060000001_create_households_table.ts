import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Tenancy root: every resource hangs from a household. Enum literals are
 * hardcoded on purpose (migrations are immutable history); the
 * `native_enums` test keeps them equal to `@monkimoney/shared` enums.
 */
export default class extends BaseSchema {
  protected tableName = 'households'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('name', 120).notNullable()
      table
        .enum('plan', ['free', 'pro'], {
          useNative: true,
          enumName: 'household_plan',
          existingType: false,
        })
        .notNullable()
        .defaultTo('free')
      table
        .enum('status', ['active', 'pending_deletion', 'suspended'], {
          useNative: true,
          enumName: 'household_status',
          existingType: false,
        })
        .notNullable()
        .defaultTo('active')
      table.specificType('currency_code', 'char(3)').notNullable().defaultTo('AUD')
      table.string('locale', 10).notNullable().defaultTo('en')
      table.string('timezone', 64).notNullable().defaultTo('Australia/Brisbane')
      table.jsonb('settings').notNullable().defaultTo('{}')
      // Billing is out of the MVP; the column only reserves the hook.
      table.string('stripe_customer_id', 64).nullable()
      table.timestamp('deletion_scheduled_at', { useTz: true }).nullable()

      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
    this.schema.raw('DROP TYPE IF EXISTS household_status')
    this.schema.raw('DROP TYPE IF EXISTS household_plan')
  }
}
