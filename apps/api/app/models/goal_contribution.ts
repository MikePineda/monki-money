import User from '#models/user'
import SavingsGoal from '#models/savings_goal'
import { belongsTo } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { GoalContributionSchema } from '#database/schema'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { HouseholdScoped } from '#models/mixins/household_scoped'

/**
 * Money put into (positive) or taken out of (negative) a goal that tracks
 * no account, logged by a member (`userId`, null once that person is gone).
 * `date` is the household's day it happened ('YYYY-MM-DD').
 */
export default class GoalContribution extends compose(GoalContributionSchema, HouseholdScoped) {
  @belongsTo(() => SavingsGoal, { foreignKey: 'goalId' })
  declare goal: BelongsTo<typeof SavingsGoal>

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>
}
