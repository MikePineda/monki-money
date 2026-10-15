import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Cards attached to an account, identified by their suffix as printed in
 * the bank export. A joint account has one card per person, which is how an
 * imported row gets its default payer.
 */
export default class extends BaseSchema {
  protected tableName = 'account_cards'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('account_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('accounts')
        .onDelete('CASCADE')
      table.string('card_suffix', 8).notNullable()
      table
        .integer('user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      table.string('label', 60).nullable()

      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      table.unique(['account_id', 'card_suffix'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
