import Household from '#models/household'
import { belongsTo } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { CategorySchema } from '#database/schema'
import CategoryGroup from '#models/category_group'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { HouseholdScoped } from '#models/mixins/household_scoped'

/**
 * A category. System categories (`isSystem`) are displayed in the reader's
 * locale; renaming one turns it into a user category with that name.
 */
export default class Category extends compose(CategorySchema, HouseholdScoped) {
  @belongsTo(() => Household)
  declare household: BelongsTo<typeof Household>

  @belongsTo(() => CategoryGroup)
  declare group: BelongsTo<typeof CategoryGroup>
}
