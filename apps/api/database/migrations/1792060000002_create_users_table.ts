import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Users log in with a cookie session. `session_version` is copied into the
 * session at login and compared on every authenticated request: bumping it
 * ("log out everywhere", password change/reset) revokes every session.
 */
export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      // Stored lowercased by the validators.
      table.string('email', 254).notNullable().unique()
      table.string('password').notNullable()
      table.string('full_name', 120).notNullable()
      table.string('locale', 10).notNullable().defaultTo('en')
      table
        .enum('theme', ['light', 'dark', 'system'], {
          useNative: true,
          enumName: 'user_theme',
          existingType: false,
        })
        .notNullable()
        .defaultTo('system')
      table.timestamp('email_verified_at', { useTz: true }).nullable()
      table.integer('session_version').notNullable().defaultTo(1)
      table
        .integer('current_household_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('households')
        .onDelete('SET NULL')
      table.timestamp('last_login_at', { useTz: true }).nullable()

      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
    this.schema.raw('DROP TYPE IF EXISTS user_theme')
  }
}
