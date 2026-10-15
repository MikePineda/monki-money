import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Category groups (Actual Budget style). `is_system` groups come from the
 * shared taxonomy and are displayed in the reader's locale.
 */
export default class extends BaseSchema {
  protected tableName = 'category_groups'

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
      table.string('name', 80).notNullable()
      table.string('slug', 80).notNullable()
      table
        .enum('kind', ['expense', 'income'], {
          useNative: true,
          enumName: 'category_group_kind',
          existingType: false,
        })
        .notNullable()
        .defaultTo('expense')
      table.integer('sort_order').notNullable().defaultTo(0)
      table.boolean('is_hidden').notNullable().defaultTo(false)
      table.boolean('is_system').notNullable().defaultTo(false)

      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      table.unique(['household_id', 'slug'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
    this.schema.raw('DROP TYPE IF EXISTS category_group_kind')
  }
}
