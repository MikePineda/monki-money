import Category from '#models/category'
import Household from '#models/household'
import { compose } from '@adonisjs/core/helpers'
import { CategoryGroupSchema } from '#database/schema'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import { HouseholdScoped } from '#models/mixins/household_scoped'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'

/** A group of categories (Actual Budget style). */
export default class CategoryGroup extends compose(CategoryGroupSchema, HouseholdScoped) {
  @belongsTo(() => Household)
  declare household: BelongsTo<typeof Household>

  @hasMany(() => Category)
  declare categories: HasMany<typeof Category>
}
