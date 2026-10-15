import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Savings goals of a household. `user_id` NULL = a goal of the household
 * (both of us), otherwise a personal one. With `account_id` the saved
 * amount is that account's cleared balance; without it, `starting_cents`.
 * The monthly rate is `monthly_contribution_cents` when set, else the
 * household's average net savings (see app/domain/goals/projection.ts).
 *
 * The account FK is RESTRICT: deleting an account a goal uses fails (409
 * `E_ACCOUNT_IN_USE`), while a household delete still cascades both (the
 * check runs after the cascade removed the goal rows).
 */
export default class extends BaseSchema {
  protected tableName = 'savings_goals'

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
      table.string('name', 80).notNullable()
      table.integer('target_cents').notNullable()
      table.date('target_date').nullable()
      table.integer('starting_cents').notNullable().defaultTo(0)
      table.integer('monthly_contribution_cents').nullable()
      table
        .integer('account_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('accounts')
        .onDelete('RESTRICT')
      table
        .integer('user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      table
        .enum('status', ['active', 'reached', 'archived'], {
          useNative: true,
          enumName: 'goal_status',
          existingType: false,
        })
        .notNullable()
        .defaultTo('active')
      table.timestamp('reached_at', { useTz: true }).nullable()
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

      table.index(['household_id', 'status'])
    })

    this.schema.raw(
      `ALTER TABLE savings_goals
         ADD CONSTRAINT savings_goals_target_positive CHECK (target_cents > 0),
         ADD CONSTRAINT savings_goals_contribution_not_negative
           CHECK (monthly_contribution_cents IS NULL OR monthly_contribution_cents >= 0)`
    )
  }

  async down() {
    this.schema.dropTable(this.tableName)
    this.schema.raw('DROP TYPE IF EXISTS goal_status')
  }
}
