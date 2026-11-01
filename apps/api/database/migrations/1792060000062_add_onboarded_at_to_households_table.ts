import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Households that already have accounts were set up before the wizard
 * reported its end: they count as onboarded since their first account. A
 * household without accounts keeps NULL (the web still probes its accounts
 * for a NULL, see apps/web/src/app/core/auth/onboarding-status.ts).
 * Exported so the backfill rule has a test of its own; never re-stamps.
 */
export const BACKFILL_ONBOARDED_AT = `
  UPDATE households
     SET onboarded_at = first_account.created_at
    FROM (SELECT household_id, MIN(created_at) AS created_at
            FROM accounts
           GROUP BY household_id) AS first_account
   WHERE first_account.household_id = households.id
     AND households.onboarded_at IS NULL`

/**
 * When the owner finished the onboarding wizard (`POST
 * /household/onboarding/complete`), so every device of the household
 * agrees on "wizard or app". Additive and nullable: an older app version
 * running side by side (start-first update) never reads it, and the
 * households it creates meanwhile stay NULL, which the web treats as
 * "probe the accounts" like before.
 */
export default class extends BaseSchema {
  protected tableName = 'households'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.timestamp('onboarded_at', { useTz: true }).nullable()
    })
    this.defer(async (db) => {
      await db.rawQuery(BACKFILL_ONBOARDED_AT)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('onboarded_at')
    })
  }
}
