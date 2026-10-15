import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * One row per LLM call (every attempt, retries included): what it was for,
 * which provider/model answered, tokens, latency, outcome and cost in
 * micro-dollars. `household_id` is NULL for operator calls (`llm:smoke`).
 * The `(household_id, created_at)` index serves the monthly quota count.
 */
export default class extends BaseSchema {
  protected tableName = 'llm_usage'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('household_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('households')
        .onDelete('CASCADE')
      table
        .integer('user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      table
        .enum('purpose', ['classify', 'receipt', 'insight'], {
          useNative: true,
          enumName: 'llm_purpose',
          existingType: false,
        })
        .notNullable()
      table.string('provider', 40).notNullable()
      table.string('model', 120).notNullable()
      table.integer('input_tokens').notNullable().defaultTo(0)
      table.integer('output_tokens').notNullable().defaultTo(0)
      table.integer('latency_ms').notNullable().defaultTo(0)
      table
        .enum('status', ['ok', 'error', 'invalid_output'], {
          useNative: true,
          enumName: 'llm_usage_status',
          existingType: false,
        })
        .notNullable()
      table.string('error_message', 500).nullable()
      table.bigint('cost_micros').notNullable().defaultTo(0)

      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      table.index(['household_id', 'created_at'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
    this.schema.raw('DROP TYPE IF EXISTS llm_purpose')
    this.schema.raw('DROP TYPE IF EXISTS llm_usage_status')
  }
}
