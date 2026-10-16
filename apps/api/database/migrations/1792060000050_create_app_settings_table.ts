import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * App-wide key-value settings the app writes for itself, so production
 * needs no env edit (today: the generated VAPID key pair of Web Push, the
 * private key encrypted with APP_KEY). `key` is unique: concurrent writers
 * insert with ON CONFLICT DO NOTHING and read back the winner. Not tenant
 * data. Additive: older app versions never read this table.
 */
export default class extends BaseSchema {
  protected tableName = 'app_settings'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('key', 100).notNullable().unique()
      table.text('value').notNullable()

      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
