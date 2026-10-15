import User from '#models/user'
import { DateTime } from 'luxon'
import Household from '#models/household'
import { compose } from '@adonisjs/core/helpers'
import { belongsTo } from '@adonisjs/lucid/orm'
import { InvitationSchema } from '#database/schema'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { HouseholdScoped } from '#models/mixins/household_scoped'

/** Invitation to join a household; only the token's sha256 is stored. */
export default class Invitation extends compose(InvitationSchema, HouseholdScoped) {
  @belongsTo(() => Household)
  declare household: BelongsTo<typeof Household>

  @belongsTo(() => User, { foreignKey: 'invitedByUserId' })
  declare invitedBy: BelongsTo<typeof User>

  isUsableAt(now: DateTime) {
    return this.acceptedAt === null && this.expiresAt > now
  }
}
