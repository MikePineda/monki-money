import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * LLM-written summary of one month of a household, one row per language
 * (unique `(household_id, month, locale)`: regenerating replaces it).
 * `input_json` keeps the exact figures the model was given (an
 * `InsightInput`, private categories already left out), so any sentence of
 * the summary can be traced back to its numbers.
 */
export default class extends BaseSchema {
  protected tableName = 'monthly_insights'

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
      // 'YYYY-MM'
      table.specificType('month', 'char(7)').notNullable()
      table.specificType('locale', 'char(2)').notNullable()
      table.string('headline', 255).notNullable()
      table.text('body_markdown').notNullable()
      table.jsonb('highlights').notNullable().defaultTo('[]')
      table.jsonb('input_json').notNullable()
      table.string('model', 120).notNullable()
      table
        .integer('generated_by_user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      table.timestamp('generated_at', { useTz: true }).notNullable()

      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      table.unique(['household_id', 'month', 'locale'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
