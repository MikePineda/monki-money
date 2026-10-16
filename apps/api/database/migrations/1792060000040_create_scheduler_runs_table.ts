import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Lock and log of the in-process scheduler (app/services/scheduler): one
 * row per job, period and household (NULL household = an app-wide job).
 * The unique key treats NULLs as equal (Postgres 15+), so claiming a run is
 * an `INSERT ... ON CONFLICT DO NOTHING` whoever runs it. `attempts`,
 * `finished_at` and `error` drive the takeover of dead or failed runs;
 * `outcome` is a short code ('generated', 'skipped:no-activity', 'failed').
 * Plain strings, no native enum: jobs come and go without a migration.
 * Additive: older app versions never read this table.
 */
export default class extends BaseSchema {
  protected tableName = 'scheduler_runs'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('job', 64).notNullable()
      table.string('period_key', 32).notNullable()
      table
        .integer('household_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('households')
        .onDelete('CASCADE')
      table.smallint('attempts').notNullable().defaultTo(1)
      table.timestamp('started_at', { useTz: true }).notNullable()
      table.timestamp('finished_at', { useTz: true }).nullable()
      table.string('outcome', 40).nullable()
      table.string('error', 500).nullable()

      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      table.index(['started_at'])
    })
    this.schema.raw(
      `ALTER TABLE ${this.tableName}
         ADD CONSTRAINT scheduler_runs_job_period_household_unique
         UNIQUE NULLS NOT DISTINCT (job, period_key, household_id)`
    )
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
