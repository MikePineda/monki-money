import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * One uploaded bank export, per account (a CSV with two `Account Number`
 * values makes two batches). Rows wait in `import_rows` while the batch is
 * `staged`; confirm turns them into ledger rows and closes it
 * (`completed`), cancel drops them (`cancelled`). At most one staged batch
 * per account (partial unique index): a second upload answers 409.
 *
 * - `file_path`: the original CSV in the bucket
 *   (`imports/{householdId}/{batchId}.csv`), null when no disk is set.
 * - Counts mirror `import_rows` by resolution (refreshed on every change);
 *   duplicates are only counted, their rows are never stored again.
 * - `expected_balance_cents`: the bank's balance on the newest row;
 *   `computed_balance_cents`: the ledger's balance at that date (projected
 *   at staging, measured on confirm); `opening_balance_cents`: derived from
 *   the oldest row when this is the account's first import.
 *
 * Enum literals are hardcoded on purpose (migrations are immutable
 * history); `test_native_enums_match_shared_enums` keeps them equal to
 * `@monkimoney/shared`. Deleting an account (only possible once it has no
 * transactions) takes its import history with it.
 */
export default class extends BaseSchema {
  protected tableName = 'import_batches'

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
        .integer('account_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('accounts')
        .onDelete('CASCADE')
      table
        .integer('uploaded_by_user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      table
        .enum('source', ['nab_csv'], {
          useNative: true,
          enumName: 'import_source',
          existingType: false,
        })
        .notNullable()
      table
        .enum('status', ['staged', 'completed', 'cancelled'], {
          useNative: true,
          enumName: 'import_batch_status',
          existingType: false,
        })
        .notNullable()
        .defaultTo('staged')
      table.string('file_name', 255).nullable()
      table.string('file_hash', 64).notNullable() // sha256 hex of the upload
      table.string('file_path', 255).nullable()
      table.date('date_from').nullable()
      table.date('date_to').nullable()

      table.integer('row_count').notNullable().defaultTo(0)
      table.integer('new_count').notNullable().defaultTo(0)
      table.integer('matched_count').notNullable().defaultTo(0)
      table.integer('confirmation_count').notNullable().defaultTo(0)
      table.integer('duplicate_count').notNullable().defaultTo(0)
      table.integer('transfer_count').notNullable().defaultTo(0)
      table.integer('ignored_count').notNullable().defaultTo(0)
      table.integer('superseded_count').notNullable().defaultTo(0)

      table.integer('expected_balance_cents').nullable()
      table.integer('computed_balance_cents').nullable()
      table.integer('opening_balance_cents').nullable()

      table.timestamp('completed_at', { useTz: true }).nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      table.index(['household_id', 'created_at'])
      table.index(['account_id'])
    })

    this.schema.raw(
      `CREATE UNIQUE INDEX import_batches_one_staged_per_account
         ON import_batches (account_id)
         WHERE status = 'staged'`
    )
  }

  async down() {
    this.schema.dropTable(this.tableName)
    this.schema.raw('DROP TYPE IF EXISTS import_batch_status')
    this.schema.raw('DROP TYPE IF EXISTS import_source')
  }
}
