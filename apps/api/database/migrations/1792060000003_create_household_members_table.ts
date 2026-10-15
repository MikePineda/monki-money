import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Membership of a user in a household with a role. "One user = one
 * household" is an MVP rule enforced by the services, not by the schema, so
 * multi-household users stay an additive change.
 */
export default class extends BaseSchema {
  protected tableName = 'household_members'

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
      table
        .enum('role', ['owner', 'member'], {
          useNative: true,
          enumName: 'member_role',
          existingType: false,
        })
        .notNullable()
        .defaultTo('member')
      table.string('display_name', 60).nullable()
      table.string('color', 16).nullable()
      table.timestamp('joined_at', { useTz: true }).notNullable()

      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      table.unique(['household_id', 'user_id'])
      table.index(['user_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
    this.schema.raw('DROP TYPE IF EXISTS member_role')
  }
}
