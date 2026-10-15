import User from '#models/user'
import Household from '#models/household'
import { belongsTo } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { MonthlyInsightSchema } from '#database/schema'
import { HouseholdScoped } from '#models/mixins/household_scoped'

/**
 * The LLM-written summary of one month, per language. `inputJson` holds the
 * exact figures the model was given.
 */
export default class MonthlyInsight extends compose(MonthlyInsightSchema, HouseholdScoped) {
  @belongsTo(() => Household)
  declare household: BelongsTo<typeof Household>

  @belongsTo(() => User, { foreignKey: 'generatedByUserId' })
  declare generatedBy: BelongsTo<typeof User>
}
