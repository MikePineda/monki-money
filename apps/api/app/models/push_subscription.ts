import User from '#models/user'
import Household from '#models/household'
import { belongsTo } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { PushSubscriptionSchema } from '#database/schema'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { HouseholdScoped } from '#models/mixins/household_scoped'

/**
 * One device (browser) of a person subscribed to Web Push. The endpoint is a
 * capability URL of the push service: it is never returned in full by the
 * API nor logged.
 */
export default class PushSubscription extends compose(PushSubscriptionSchema, HouseholdScoped) {
  @belongsTo(() => Household)
  declare household: BelongsTo<typeof Household>

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}
