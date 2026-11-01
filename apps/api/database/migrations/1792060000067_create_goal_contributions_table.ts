import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * What was put into (or taken out of) a goal that tracks no account: one
 * row per entry a member logs on the goal's screen. `amount_cents` is
 * signed (a withdrawal is negative, never 0) and `date` is the household's
 * day it happened. The goal's saved amount is `starting_cents` plus these
 * rows; a goal that tracks an account ignores them (its account's cleared
 * balance is the saved amount). Deleting the goal or the household drops
 * the rows; deleting the person keeps them (`user_id` NULL). Additive:
 * older app versions never read the table.
 */
export default class extends BaseSchema {
  protected tableName = 'goal_contributions'

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
        .integer('goal_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('savings_goals')
        .onDelete('CASCADE')
      table
        .integer('user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      table.integer('amount_cents').notNullable()
      table.date('date').notNullable()
      table.string('memo', 140).nullable()

      table.timestamp('created_at', { useTz: true }).notNullable()

      table.index(['goal_id', 'date'], 'goal_contributions_goal_date_index')
      table.index(['household_id'], 'goal_contributions_household_index')
    })

    this.schema.raw(
      `ALTER TABLE ${this.tableName}
         ADD CONSTRAINT goal_contributions_amount_not_zero CHECK (amount_cents <> 0)`
    )
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
