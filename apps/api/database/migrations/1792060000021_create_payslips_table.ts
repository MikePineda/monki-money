import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Payslips: a payout from an umbrella service (an account of kind `wallet`,
 * whatever its name) recorded as its gross income plus deduction lines in
 * that account, linked to the transfer that took the net to the bank.
 *
 * - The money lives in `transactions` rows pointing here through
 *   `transactions.payslip_id`: one income row (the gross) and one expense
 *   row per deduction. Deleting the payslip deletes them (CASCADE as a
 *   safety net; the service deletes them itself).
 * - `transfer_id`: the wallet -> bank transfer whose amount is `net_cents`.
 *   One payslip per transfer (partial unique index); deleting the transfer
 *   unlinks it (SET NULL) and keeps the payslip.
 * - `user_id` NULL = joint (who earned it).
 * - `client_id`: idempotency key of the PWA; unique per household, so a
 *   retried create never records the payout (and its transfer) twice.
 * - Invariant `gross - sum(deductions) = net` is enforced by the service;
 *   the checks below only keep the amounts sane.
 *
 * Additive: older app versions never read the new column of `transactions`.
 */
export default class extends BaseSchema {
  protected tableName = 'payslips'

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
        .integer('user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      table.date('date').notNullable()
      table.integer('gross_cents').notNullable()
      table.integer('net_cents').notNullable()
      table
        .integer('transfer_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('transfers')
        .onDelete('SET NULL')
      table.string('memo', 255).nullable()
      table.uuid('client_id').nullable()
      table
        .integer('created_by_user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')

      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
    })

    this.schema.raw(
      `ALTER TABLE payslips
         ADD CONSTRAINT payslips_gross_positive CHECK (gross_cents > 0),
         ADD CONSTRAINT payslips_net_positive CHECK (net_cents > 0),
         ADD CONSTRAINT payslips_net_within_gross CHECK (net_cents <= gross_cents)`
    )
    this.schema.raw(
      `CREATE INDEX payslips_household_date_index ON payslips (household_id, date DESC, id DESC)`
    )
    this.schema.raw(
      `CREATE UNIQUE INDEX payslips_household_client_id_unique
         ON payslips (household_id, client_id)
         WHERE client_id IS NOT NULL`
    )
    this.schema.raw(
      `CREATE UNIQUE INDEX payslips_transfer_id_unique
         ON payslips (transfer_id)
         WHERE transfer_id IS NOT NULL`
    )

    this.schema.alterTable('transactions', (table) => {
      table
        .integer('payslip_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('payslips')
        .onDelete('CASCADE')
      table.index(['payslip_id'])
    })
    // A payslip line is income or an expense, never a transfer leg.
    this.schema.raw(
      `ALTER TABLE transactions
         ADD CONSTRAINT transactions_payslip_line_is_not_a_transfer
           CHECK (payslip_id IS NULL OR kind <> 'transfer')`
    )
  }

  async down() {
    // Dropping the column drops its index, FK and check constraint too.
    this.schema.alterTable('transactions', (table) => {
      table.dropColumn('payslip_id')
    })
    this.schema.dropTable(this.tableName)
  }
}
