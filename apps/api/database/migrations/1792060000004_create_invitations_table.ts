import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Invitations to join a household. Only the sha256 of the token is stored;
 * the clear token travels once, in the email/link.
 */
export default class extends BaseSchema {
  protected tableName = 'invitations'

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
      table.string('email', 254).notNullable()
      table.string('token_hash', 64).notNullable().unique()
      table
        .enum('role', ['owner', 'member'], {
          useNative: true,
          enumName: 'member_role',
          existingType: true,
        })
        .notNullable()
        .defaultTo('member')
      table
        .integer('invited_by_user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      table.timestamp('expires_at', { useTz: true }).notNullable()
      table.timestamp('accepted_at', { useTz: true }).nullable()

      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      table.index(['household_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
