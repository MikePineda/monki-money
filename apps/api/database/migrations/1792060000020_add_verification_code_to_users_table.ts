import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Email verification by a 6-digit code, next to the link (on iOS the link
 * opens Safari, not the installed PWA). Only a hash of the code is stored
 * (`sha256("<user id>:<code>")`, hex); it lives 15 minutes and dies after
 * 5 wrong attempts. Additive: older app versions never read these columns.
 */
export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('email_verification_code_hash', 64).nullable()
      table.timestamp('email_verification_code_expires_at', { useTz: true }).nullable()
      table.smallint('email_verification_code_attempts').notNullable().defaultTo(0)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('email_verification_code_hash')
      table.dropColumn('email_verification_code_expires_at')
      table.dropColumn('email_verification_code_attempts')
    })
  }
}
