import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Per-person runs in the scheduler's lock (push notifications: one per
 * person, kind and day). `user_id` NULL = a household-wide (or app-wide)
 * run, which is every row written so far. The unique key grows to
 * `(job, period_key, household_id, user_id)`, NULLs still equal, so an
 * existing run keeps exactly one row and a person-level run of the same job
 * and period gets one per person. Older app versions claim with a bare
 * `ON CONFLICT DO NOTHING` and only write household-level rows, so they keep
 * working against either constraint during a start-first overlap.
 */
export default class extends BaseSchema {
  protected tableName = 'scheduler_runs'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table
        .integer('user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
    })
    this.schema.raw(
      `ALTER TABLE ${this.tableName}
         ADD CONSTRAINT scheduler_runs_job_period_household_user_unique
         UNIQUE NULLS NOT DISTINCT (job, period_key, household_id, user_id)`
    )
    this.schema.raw(
      `ALTER TABLE ${this.tableName} DROP CONSTRAINT scheduler_runs_job_period_household_unique`
    )
  }

  async down() {
    // Person-level rows cannot fit the narrower key: drop them first.
    this.schema.raw(`DELETE FROM ${this.tableName} WHERE user_id IS NOT NULL`)
    this.schema.raw(
      `ALTER TABLE ${this.tableName}
         ADD CONSTRAINT scheduler_runs_job_period_household_unique
         UNIQUE NULLS NOT DISTINCT (job, period_key, household_id)`
    )
    this.schema.raw(
      `ALTER TABLE ${this.tableName} DROP CONSTRAINT scheduler_runs_job_period_household_user_unique`
    )
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('user_id')
    })
  }
}
