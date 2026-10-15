import User from '#models/user'
import Household from '#models/household'
import AccountCard from '#models/account_card'
import { AccountSchema } from '#database/schema'
import { compose } from '@adonisjs/core/helpers'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import { HouseholdScoped } from '#models/mixins/household_scoped'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'

/** A money account. `ownerUserId` null means a joint account. */
export default class Account extends compose(AccountSchema, HouseholdScoped) {
  @belongsTo(() => Household)
  declare household: BelongsTo<typeof Household>

  @belongsTo(() => User, { foreignKey: 'ownerUserId' })
  declare owner: BelongsTo<typeof User>

  @hasMany(() => AccountCard)
  declare cards: HasMany<typeof AccountCard>

  get isJoint() {
    return this.ownerUserId === null
  }
}
