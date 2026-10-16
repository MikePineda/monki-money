import User from '#models/user'
import Household from '#models/household'
import { compose } from '@adonisjs/core/helpers'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { HouseholdScoped } from '#models/mixins/household_scoped'
import { HouseholdOwnershipTransferSchema } from '#database/schema'

/**
 * One handover of a household: the owner `fromUserId` made `toUserId` the
 * owner at `createdAt` (and became a member). Insert-only audit log.
 */
export default class HouseholdOwnershipTransfer extends compose(
  HouseholdOwnershipTransferSchema,
  HouseholdScoped
) {
  @belongsTo(() => Household)
  declare household: BelongsTo<typeof Household>

  @belongsTo(() => User, { foreignKey: 'fromUserId' })
  declare fromUser: BelongsTo<typeof User>

  @belongsTo(() => User, { foreignKey: 'toUserId' })
  declare toUser: BelongsTo<typeof User>
}
