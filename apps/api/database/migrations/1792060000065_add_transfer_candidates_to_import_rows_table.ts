import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * `import_rows.transfer_candidate_account_ids`: the accounts an internal
 * transfer's linked holder is known to move money to, when there are
 * several and nothing (opposite leg) says which one; the review screen
 * offers them. A JSON array of account ids, empty for every other row
 * (also for rows staged by an older version while both run side by side).
 * Additive: older app versions never read it.
 */
export default class extends BaseSchema {
  protected tableName = 'import_rows'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.jsonb('transfer_candidate_account_ids').notNullable().defaultTo('[]')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('transfer_candidate_account_ids')
    })
  }
}
