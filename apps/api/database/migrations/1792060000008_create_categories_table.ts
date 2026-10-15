import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Categories. `slug` is stable per household (importer maps and rules point
 * at it); `is_system` categories are displayed in the reader's locale,
 * user-created (or renamed) ones keep the name as typed. There is no
 * "transfer" or "uncategorized" category: uncategorized is NULL.
 */
export default class extends BaseSchema {
  protected tableName = 'categories'

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
      // NO ACTION (checked at the end of the statement): a household delete
      // cascades both tables, while deleting a non-empty group directly fails.
      table
        .integer('category_group_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('category_groups')
      table.string('name', 80).notNullable()
      table.string('slug', 80).notNullable()
      table.string('icon', 40).nullable()
      table.integer('sort_order').notNullable().defaultTo(0)
      table.boolean('is_hidden').notNullable().defaultTo(false)
      table.boolean('is_system').notNullable().defaultTo(false)
      table
        .integer('created_by_user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')

      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      table.unique(['household_id', 'slug'])
      table.index(['category_group_id', 'sort_order'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
