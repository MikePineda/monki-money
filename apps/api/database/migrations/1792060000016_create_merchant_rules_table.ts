import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Household rules that categorize bank rows (or make them transfers) before
 * anyone looks at them: `merchant` matches the normalized merchant key,
 * `contains` a whole word of the bank text, `regex` a pattern. Every rule
 * names a category, a transfer account or both (CHECK); it may also set the
 * payer and a clean payee.
 *
 * `origin`: `user` (typed by a person), `learned` (from confirmed imports
 * and "apply to future" edits), `system` (the bank defaults seeded per
 * household). One rule per (household, match_type, pattern). Deleting a
 * category or account drops the rules that point at it.
 */
export default class extends BaseSchema {
  protected tableName = 'merchant_rules'

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
        .enum('match_type', ['merchant', 'contains', 'regex'], {
          useNative: true,
          enumName: 'rule_match_type',
          existingType: false,
        })
        .notNullable()
      table.string('pattern', 255).notNullable()
      table
        .integer('category_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('categories')
        .onDelete('CASCADE')
      table
        .integer('transfer_account_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('accounts')
        .onDelete('CASCADE')
      table
        .integer('paid_by_user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      table.string('payee_override', 120).nullable()
      table.integer('priority').notNullable().defaultTo(0)
      table.integer('hit_count').notNullable().defaultTo(0)
      table.timestamp('last_hit_at', { useTz: true }).nullable()
      table
        .enum('origin', ['user', 'learned', 'system'], {
          useNative: true,
          enumName: 'rule_origin',
          existingType: false,
        })
        .notNullable()
        .defaultTo('user')
      table
        .integer('created_by_user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')

      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      table.unique(['household_id', 'match_type', 'pattern'], {
        indexName: 'merchant_rules_household_type_pattern_unique',
      })
    })

    this.schema.raw(
      `ALTER TABLE merchant_rules
         ADD CONSTRAINT merchant_rules_has_target
           CHECK (category_id IS NOT NULL OR transfer_account_id IS NOT NULL)`
    )
  }

  async down() {
    this.schema.dropTable(this.tableName)
    this.schema.raw('DROP TYPE IF EXISTS rule_origin')
    this.schema.raw('DROP TYPE IF EXISTS rule_match_type')
  }
}
