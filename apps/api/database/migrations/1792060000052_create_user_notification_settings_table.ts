import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * A person's push notification preferences (`PATCH /me/notifications`).
 * No row = the defaults (summary on, daily reminder off at 20:00), so
 * existing users need no backfill. `reminder_time` is 'HH:mm' in the
 * household time zone. Additive: older app versions never read this table.
 */
export default class extends BaseSchema {
  protected tableName = 'user_notification_settings'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .unique()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table.boolean('summary_ready').notNullable().defaultTo(true)
      table.boolean('daily_reminder').notNullable().defaultTo(false)
      table.specificType('reminder_time', 'char(5)').notNullable().defaultTo('20:00')

      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
    })
    // Only the reminder job scans by preference.
    this.schema.raw(
      `CREATE INDEX user_notification_settings_daily_reminder_index
         ON ${this.tableName} (user_id) WHERE daily_reminder`
    )
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
