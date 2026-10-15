import Household from '#models/household'
import { UserSchema } from '#database/schema'
import hash from '@adonisjs/core/services/hash'
import HouseholdMember from '#models/household_member'
import { compose } from '@adonisjs/core/helpers'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'

/**
 * A person who logs in. Emails are stored lowercased. `sessionVersion` is
 * the revocation counter compared by the verify_session_version middleware.
 */
export default class User extends compose(
  UserSchema,
  withAuthFinder(hash, { uids: ['email'], passwordColumnName: 'password' })
) {
  @belongsTo(() => Household, { foreignKey: 'currentHouseholdId' })
  declare currentHousehold: BelongsTo<typeof Household>

  @hasMany(() => HouseholdMember)
  declare memberships: HasMany<typeof HouseholdMember>

  get isEmailVerified() {
    return this.emailVerifiedAt !== null
  }
}
