import User from '#models/user'
import Account from '#models/account'
import Household from '#models/household'
import { belongsTo } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { SavingsGoalSchema } from '#database/schema'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { HouseholdScoped } from '#models/mixins/household_scoped'

/**
 * A savings goal. `userId` null = a goal of the household; `accountId` set =
 * the saved amount is that account's cleared balance, else `startingCents`.
 */
export default class SavingsGoal extends compose(SavingsGoalSchema, HouseholdScoped) {
  @belongsTo(() => Household)
  declare household: BelongsTo<typeof Household>

  @belongsTo(() => Account)
  declare account: BelongsTo<typeof Account>

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}
