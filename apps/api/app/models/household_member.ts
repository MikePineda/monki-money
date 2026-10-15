import User from '#models/user'
import Household from '#models/household'
import { compose } from '@adonisjs/core/helpers'
import { belongsTo } from '@adonisjs/lucid/orm'
import { HouseholdMemberSchema } from '#database/schema'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { HouseholdScoped } from '#models/mixins/household_scoped'

/** Membership of a user in a household, with a role. */
export default class HouseholdMember extends compose(HouseholdMemberSchema, HouseholdScoped) {
  @belongsTo(() => Household)
  declare household: BelongsTo<typeof Household>

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  get isOwner() {
    return this.role === 'owner'
  }
}
