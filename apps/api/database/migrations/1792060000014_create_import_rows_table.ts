import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * One bank row of an import batch, as staged by the pipeline
 * (app/domain/importing) and then decided by a person.
 *
 * - `external_hash` identifies the bank row (see docs/import-pipeline.md):
 *   unique per household and account, whatever the resolution, so a row
 *   never comes back (ignored and superseded rows included). Duplicates of
 *   a re-upload are counted on the batch, never stored.
 * - Pipeline columns (`resolution`, `match_*`, `suggest*`, `transfer_*`,
 *   `needs_review`, `reasons`) describe what the importer proposes.
 * - `decision` (jsonb) is what the person changed before confirming
 *   (`categoryId`, `transferAccountId`, `matchTransactionId`, `paidByUserId`,
 *   `payee`, `splits`, `learnRule`), validated when written and again on
 *   confirm; keys left out keep the proposal.
 * - `transaction_id` / `confirmed_at`: the ledger row the bank row became
 *   (or was linked to) once confirmed.
 * - `raw` keeps the original cells; it is data, never rendered as HTML.
 *
 * `suggestion_rule_id` / `transfer_rule_id` carry no foreign key (rules are
 * created by a later migration and may be deleted): they only explain the
 * proposal.
 */
export default class extends BaseSchema {
  protected tableName = 'import_rows'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('import_batch_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('import_batches')
        .onDelete('CASCADE')
      table
        .integer('household_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('households')
        .onDelete('CASCADE')
      table
        .integer('account_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('accounts')
        .onDelete('CASCADE')
      table.integer('row_index').notNullable()
      table.integer('occurrence').notNullable().defaultTo(1)
      table.string('external_hash', 64).notNullable()
      table.jsonb('raw').notNullable().defaultTo('{}')

      table.date('bank_date').notNullable()
      table.date('date').notNullable()
      table.date('processed_on').nullable()
      table.integer('amount_cents').notNullable()
      table.integer('balance_cents').nullable()
      table.string('transaction_type', 80).notNullable().defaultTo('')
      table.text('description_raw').notNullable()
      table.text('description_normalized').notNullable()
      table.string('merchant_key', 255).notNullable().defaultTo('')
      table.string('merchant_full_key', 255).notNullable().defaultTo('')
      table.string('nab_category', 120).nullable()
      table.string('nab_merchant', 255).nullable()
      table.string('card_suffix', 8).nullable()
      table.boolean('is_pending').notNullable().defaultTo(false)
      table.boolean('is_future_dated').notNullable().defaultTo(false)

      table
        .enum(
          'resolution',
          [
            'new',
            'auto_matched',
            'needs_confirmation',
            'duplicate',
            'transfer_leg',
            'ignored',
            'superseded',
          ],
          { useNative: true, enumName: 'import_resolution', existingType: false }
        )
        .notNullable()
      table.boolean('needs_review').notNullable().defaultTo(false)
      table.jsonb('reasons').notNullable().defaultTo('[]')

      table
        .integer('match_transaction_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('transactions')
        .onDelete('SET NULL')
      table.integer('match_score').nullable()
      table.boolean('upgrades_pending').notNullable().defaultTo(false)

      table
        .integer('suggested_category_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('categories')
        .onDelete('SET NULL')
      table
        .enum('suggestion_source', ['rule', 'nab_map', 'llm', 'none'], {
          useNative: true,
          enumName: 'suggestion_source',
          existingType: false,
        })
        .nullable()
      table.float('suggestion_confidence').nullable()
      table.boolean('suggestion_needs_review').notNullable().defaultTo(false)
      table.integer('suggestion_rule_id').nullable()
      table.string('suggested_payee', 120).nullable()

      table
        .integer('suggested_transfer_account_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('accounts')
        .onDelete('SET NULL')
      table.string('transfer_signal', 30).nullable()
      table.integer('transfer_rule_id').nullable()
      table
        .integer('transfer_leg_transaction_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('transactions')
        .onDelete('SET NULL')
      table.string('transfer_leg_hash', 64).nullable()

      table
        .integer('suggested_paid_by_user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')

      table.jsonb('decision').nullable()
      table.timestamp('decided_at', { useTz: true }).nullable()
      table
        .integer('decided_by_user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')

      table
        .integer('transaction_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('transactions')
        .onDelete('SET NULL')
      table.timestamp('confirmed_at', { useTz: true }).nullable()

      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      table.unique(['household_id', 'account_id', 'external_hash'], {
        indexName: 'import_rows_household_account_hash_unique',
      })
      table.index(['import_batch_id', 'row_index'])
      table.index(['transaction_id'])
      table.index(['match_transaction_id'])
    })

    this.schema.raw(
      `ALTER TABLE import_rows
         ADD CONSTRAINT import_rows_reasons_is_array CHECK (jsonb_typeof(reasons) = 'array'),
         ADD CONSTRAINT import_rows_decision_is_object
           CHECK (decision IS NULL OR jsonb_typeof(decision) = 'object')`
    )
  }

  async down() {
    this.schema.dropTable(this.tableName)
    this.schema.raw('DROP TYPE IF EXISTS suggestion_source')
    this.schema.raw('DROP TYPE IF EXISTS import_resolution')
  }
}
