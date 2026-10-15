import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Storage of the `@adonisjs/limiter` database store (shape required by
 * rate-limiter-flexible). Keeps throttling correct across replicas without
 * Redis. Tests use the memory store.
 */
export default class extends BaseSchema {
  protected tableName = 'rate_limits'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.string('key', 255).notNullable().primary()
      table.integer('points', 9).notNullable().defaultTo(0)
      table.bigint('expire').unsigned()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
