import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * When the members were told (Web Push) that the goal reached its target
 * (`remainingCents` 0). NULL = not told for the current reach: the "goal
 * reached" job (app/services/goals/goal_reached_job.ts) stamps it when it
 * sees the goal at its target and clears it once the goal is short of its
 * target again, so a later reach is announced too. No backfill: an active
 * goal already at its target is announced once after the deploy. Additive:
 * older app versions never read the column.
 */
export default class extends BaseSchema {
  protected tableName = 'savings_goals'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.timestamp('reached_notified_at', { useTz: true }).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('reached_notified_at')
    })
  }
}
