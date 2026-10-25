import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Several recurring items per merchant key: two plans at one merchant (two
 * phone lines, $65 and $45) are two items, told apart by their amount
 * (app/domain/recurring/matching.ts). The unique index on
 * (household_id, merchant_key) becomes a plain one; writers of a
 * household's items still run one at a time under the advisory lock
 * (`lockRecurringItems`), so a detection run never inserts a pattern twice.
 *
 * Only relaxes a constraint: the previous release keeps working while both
 * run side by side (it reads one item per key and never relies on the
 * index to reject a write). `down` restores the unique index and fails
 * while a household has two items under one key.
 */
export default class extends BaseSchema {
  protected tableName = 'recurring_items'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropUnique(
        ['household_id', 'merchant_key'],
        'recurring_items_household_merchant_key_unique'
      )
      table.index(['household_id', 'merchant_key'], 'recurring_items_household_merchant_key_index')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropIndex(
        ['household_id', 'merchant_key'],
        'recurring_items_household_merchant_key_index'
      )
      table.unique(['household_id', 'merchant_key'], {
        indexName: 'recurring_items_household_merchant_key_unique',
      })
    })
  }
}
