import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Recurring payments of a household (rent, phone, gym, subscriptions),
 * detected from the ledger (`source = detected`) or typed by a person
 * (`manual`). One item per merchant: `merchant_key` is the importer's
 * normalized payee key (app/domain/importing/normalize.ts `merchantKey`),
 * unique per household.
 *
 * - `amount_cents` is the typical amount (positive); a payment counts as
 *   this item when it is within `amount_tolerance_pct` of it.
 * - `last_paid_date` / `occurrences` are observations of the ledger (null /
 *   0 for an item typed before any payment); `next_expected_date` is the
 *   next due date.
 * - `status`: `paused` stops counting it as committed, `dismissed` keeps
 *   detection from ever recreating it.
 * - `edited_fields`: the fields a person changed (jsonb array of field
 *   names); detection never overwrites them.
 *
 * Category, account and payer FKs SET NULL: deleting a category or an
 * account is never blocked by a recurring item. Enum literals are
 * hardcoded on purpose (`test_native_enums_match_shared_enums`).
 */
export default class extends BaseSchema {
  protected tableName = 'recurring_items'

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
      table.string('merchant_key', 255).notNullable()
      table.string('payee', 120).notNullable()
      table
        .integer('category_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('categories')
        .onDelete('SET NULL')
      table
        .integer('account_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('accounts')
        .onDelete('SET NULL')
      table
        .integer('paid_by_user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      table
        .enum('cadence', ['weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly'], {
          useNative: true,
          enumName: 'recurring_cadence',
          existingType: false,
        })
        .notNullable()
      table.integer('amount_cents').notNullable()
      table.integer('amount_tolerance_pct').notNullable().defaultTo(15)
      table.date('last_paid_date').nullable()
      table.date('next_expected_date').notNullable()
      table
        .enum('status', ['active', 'paused', 'dismissed'], {
          useNative: true,
          enumName: 'recurring_status',
          existingType: false,
        })
        .notNullable()
        .defaultTo('active')
      table
        .enum('source', ['detected', 'manual'], {
          useNative: true,
          enumName: 'recurring_source',
          existingType: false,
        })
        .notNullable()
        .defaultTo('detected')
      table.integer('occurrences').notNullable().defaultTo(0)
      table.jsonb('edited_fields').notNullable().defaultTo('[]')

      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      table.unique(['household_id', 'merchant_key'], {
        indexName: 'recurring_items_household_merchant_key_unique',
      })
      table.index(['household_id', 'status', 'next_expected_date'])
    })

    this.schema.raw(
      `ALTER TABLE recurring_items
         ADD CONSTRAINT recurring_items_amount_positive CHECK (amount_cents > 0),
         ADD CONSTRAINT recurring_items_tolerance_range
           CHECK (amount_tolerance_pct BETWEEN 0 AND 100),
         ADD CONSTRAINT recurring_items_merchant_key_present CHECK (merchant_key <> ''),
         ADD CONSTRAINT recurring_items_occurrences_not_negative CHECK (occurrences >= 0),
         ADD CONSTRAINT recurring_items_edited_fields_is_array
           CHECK (jsonb_typeof(edited_fields) = 'array')`
    )
  }

  async down() {
    this.schema.dropTable(this.tableName)
    this.schema.raw('DROP TYPE IF EXISTS recurring_source')
    this.schema.raw('DROP TYPE IF EXISTS recurring_status')
    this.schema.raw('DROP TYPE IF EXISTS recurring_cadence')
  }
}
