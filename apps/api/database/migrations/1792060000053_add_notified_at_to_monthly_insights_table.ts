import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * When the members were told (Web Push) that a scheduled summary is ready.
 * NULL = not yet. Scheduled summaries written before this column existed
 * are marked as told, so the first deploy never announces an old month;
 * summaries someone tapped stay NULL (they are never announced, and the
 * scheduler replacing a partial one on the 1st makes it announceable).
 * Additive: older app versions never read the column.
 */
export default class extends BaseSchema {
  protected tableName = 'monthly_insights'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.timestamp('notified_at', { useTz: true }).nullable()
    })
    this.defer(async (db) => {
      await db
        .from(this.tableName)
        .whereNull('generated_by_user_id')
        .update({ notified_at: db.raw('generated_at') })
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('notified_at')
    })
  }
}
