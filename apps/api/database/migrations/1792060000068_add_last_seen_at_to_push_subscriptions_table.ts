import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Devices registered before this release were last seen when they last
 * registered (or refreshed): that is their `updated_at`. Exported so the
 * backfill rule has a test of its own; never re-stamps a device that has
 * a value.
 */
export const BACKFILL_LAST_SEEN_AT = `
  UPDATE push_subscriptions
     SET last_seen_at = updated_at
   WHERE last_seen_at IS NULL`

/**
 * When a device last registered with the API (`POST /push/subscriptions`,
 * which the web repeats on every Settings visit), so Settings tells a live
 * device from a forgotten one even before its first push (`last_used_at`
 * is the last delivered push). Additive and nullable: an older app
 * version running side by side (start-first update) never reads it, and a
 * device it registers meanwhile keeps NULL until its next registration.
 */
export default class extends BaseSchema {
  protected tableName = 'push_subscriptions'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.timestamp('last_seen_at', { useTz: true }).nullable()
    })
    this.defer(async (db) => {
      await db.rawQuery(BACKFILL_LAST_SEEN_AT)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('last_seen_at')
    })
  }
}
