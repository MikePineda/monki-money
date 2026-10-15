import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * The ledger. `amount_cents` is signed: negative leaves the account
 * (expenses, outgoing transfer legs), positive enters it (income, refunds,
 * incoming legs). `date` is the effective purchase date, `bank_date` the
 * bank's posting date; both are calendar dates (months are calendar months
 * over `date`).
 *
 * - Transfers: two rows of kind `transfer` linked by `transfer_id`.
 * - Splits: `is_split` rows have no category; their lines live in
 *   `transaction_splits` and sum to `amount_cents` (service invariant).
 * - `paid_by_user_id` NULL = joint ("both of us").
 * - `client_id`: idempotency key of the PWA; unique per household.
 * - `is_private`: only the payer (or the creator of a joint one) sees the
 *   details; the partner sees the amount as "Private".
 * - `tags`: free labels (jsonb array of strings), e.g. a trip.
 *
 * Enum literals are hardcoded on purpose (migrations are immutable
 * history); `test_native_enums_match_shared_enums` keeps them equal to
 * `@monkimoney/shared`. Account and category FKs use NO ACTION (checked at
 * the end of the statement): direct deletes of a referenced account or
 * category fail, a household delete cascades everything.
 */
export default class extends BaseSchema {
  protected tableName = 'transactions'

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
      table.integer('account_id').unsigned().notNullable().references('id').inTable('accounts')
      table
        .enum('kind', ['expense', 'income', 'transfer'], {
          useNative: true,
          enumName: 'transaction_kind',
          existingType: false,
        })
        .notNullable()
      table.date('date').notNullable()
      table.date('bank_date').nullable()
      table.integer('amount_cents').notNullable()
      table.specificType('currency_code', 'char(3)').notNullable().defaultTo('AUD')
      table.string('payee', 120).nullable()
      table.string('description', 500).nullable()
      table.text('raw_description').nullable()
      table.integer('category_id').unsigned().nullable().references('id').inTable('categories')
      table.boolean('is_split').notNullable().defaultTo(false)
      table
        .integer('transfer_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('transfers')
        .onDelete('CASCADE')
      table
        .integer('paid_by_user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      table
        .enum('status', ['pending', 'cleared'], {
          useNative: true,
          enumName: 'transaction_status',
          existingType: false,
        })
        .notNullable()
        .defaultTo('cleared')
      table
        .enum('source', ['manual', 'import', 'receipt', 'telegram'], {
          useNative: true,
          enumName: 'transaction_source',
          existingType: false,
        })
        .notNullable()
        .defaultTo('manual')
      table.boolean('needs_review').notNullable().defaultTo(false)
      table.string('card_suffix', 8).nullable()
      table.uuid('client_id').nullable()
      table.boolean('is_private').notNullable().defaultTo(false)
      table.jsonb('tags').notNullable().defaultTo('[]')
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

      table.index(['account_id', 'date'])
      table.index(['household_id', 'category_id'])
      table.index(['transfer_id'])
      // Candidates for the import matcher: same account, same amount, nearby date.
      table.index(['household_id', 'account_id', 'amount_cents', 'date'])
    })

    this.schema.raw(
      `CREATE INDEX transactions_household_date_index ON transactions (household_id, date DESC, id DESC)`
    )
    this.schema.raw(
      `CREATE INDEX transactions_household_needs_review_index
         ON transactions (household_id, date DESC)
         WHERE needs_review`
    )
    this.schema.raw(
      `CREATE UNIQUE INDEX transactions_household_client_id_unique
         ON transactions (household_id, client_id)
         WHERE client_id IS NOT NULL`
    )
    this.schema.raw(
      `ALTER TABLE transactions
         ADD CONSTRAINT transactions_transfer_link CHECK ((kind = 'transfer') = (transfer_id IS NOT NULL)),
         ADD CONSTRAINT transactions_split_has_no_category CHECK (NOT (is_split AND category_id IS NOT NULL)),
         ADD CONSTRAINT transactions_tags_is_array CHECK (jsonb_typeof(tags) = 'array')`
    )
  }

  async down() {
    this.schema.dropTable(this.tableName)
    this.schema.raw('DROP TYPE IF EXISTS transaction_source')
    this.schema.raw('DROP TYPE IF EXISTS transaction_status')
    this.schema.raw('DROP TYPE IF EXISTS transaction_kind')
  }
}
