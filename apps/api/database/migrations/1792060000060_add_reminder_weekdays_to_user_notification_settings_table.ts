import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * The days the daily reminder goes out (`PATCH /me/notifications`,
 * `reminderWeekdays`): a jsonb array of ISO weekdays, Monday 1 to Sunday 7,
 * in the household time zone. Defaults to every day, so existing rows keep
 * today's behaviour. Additive: older app versions never read the column.
 */
export default class extends BaseSchema {
  protected tableName = 'user_notification_settings'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.jsonb('reminder_weekdays').notNullable().defaultTo('[1,2,3,4,5,6,7]')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('reminder_weekdays')
    })
  }
}
