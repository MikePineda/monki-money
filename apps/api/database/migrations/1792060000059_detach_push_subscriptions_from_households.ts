import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Push subscriptions follow their person: they move to the household a
 * person joins and are detached (`household_id` NULL, nothing is sent to
 * them) while the person belongs to none. The column becomes nullable and
 * the devices registered in a household their person has since left move to
 * the person's current household (or are detached). Safe with the previous
 * version running alongside: it only reads rows of a household, which a
 * detached row is not.
 */
export default class extends BaseSchema {
  protected tableName = 'push_subscriptions'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.setNullable('household_id')
    })
    this.defer(async (db) => {
      await db.rawQuery(
        `UPDATE ${this.tableName} AS subscription
            SET household_id = users.current_household_id, updated_at = now()
           FROM users
          WHERE users.id = subscription.user_id
            AND subscription.household_id IS DISTINCT FROM users.current_household_id`
      )
    })
  }

  async down() {
    this.defer(async (db) => {
      await db.from(this.tableName).whereNull('household_id').delete()
    })
    this.schema.alterTable(this.tableName, (table) => {
      table.dropNullable('household_id')
    })
  }
}
