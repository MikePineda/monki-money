import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Where each linked holder's internal transfers go: one row per
 * (household, holder, account) a confirmed import sent them to. NAB names
 * the holder of the linked account on every internal transfer
 * (`ONLINE <ref> <memo> SMITH JO`), and a couple with three or more accounts
 * at the bank sees the same holder on transfers to each of them, so a holder
 * maps to a set of accounts, not to one rule: with one account the importer
 * proposes it, with several the row waits for a person.
 *
 * `holder_key` is `linkedHolderKey` (`linked acc trns smith jo`), the same
 * key earlier releases learned as a `merchant_rules` pattern; those rules
 * keep counting as one more known account. Deleting the household or the
 * account drops the rows. Additive: older app versions never read it.
 */
export default class extends BaseSchema {
  protected tableName = 'linked_holder_accounts'

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
      table.string('holder_key', 255).notNullable()
      table
        .integer('account_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('accounts')
        .onDelete('CASCADE')
      table.integer('confirmed_count').notNullable().defaultTo(1)
      table.timestamp('last_confirmed_at', { useTz: true }).notNullable()

      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      table.unique(['household_id', 'holder_key', 'account_id'], {
        indexName: 'linked_holder_accounts_household_holder_account_unique',
      })
      table.index(['account_id'], 'linked_holder_accounts_account_index')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
