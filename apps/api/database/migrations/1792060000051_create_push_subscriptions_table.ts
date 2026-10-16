import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * One Web Push subscription per browser (device) of a person, as
 * `PushManager.subscribe()` returned it: the push service's `endpoint`
 * (unique: a browser holds one per app) and the keys that encrypt the
 * payload (`p256dh`, `auth`). `household_id` is the household the person was
 * in when the device subscribed (pushes go to the current household's
 * rows). A 404/410 from the push service deletes the row; `failures` counts
 * other failed sends in a row and `last_used_at` the last delivered one.
 * Additive: older app versions never read this table.
 */
export default class extends BaseSchema {
  protected tableName = 'push_subscriptions'

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
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table.text('endpoint').notNullable().unique()
      table.string('p256dh', 200).notNullable()
      table.string('auth', 100).notNullable()
      table.string('user_agent', 255).nullable()
      table.timestamp('last_used_at', { useTz: true }).nullable()
      table.smallint('failures').notNullable().defaultTo(0)

      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      table.index(['user_id', 'household_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
