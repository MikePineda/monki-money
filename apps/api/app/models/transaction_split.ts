import Category from '#models/category'
import Transaction from '#models/transaction'
import { belongsTo } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { TransactionSplitSchema } from '#database/schema'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { HouseholdScoped } from '#models/mixins/household_scoped'

/**
 * One line of a split transaction (signed like its parent). Carries the
 * parent's `householdId`; load the parent with `findInHousehold` first.
 */
export default class TransactionSplit extends compose(TransactionSplitSchema, HouseholdScoped) {
  @belongsTo(() => Transaction)
  declare transaction: BelongsTo<typeof Transaction>

  @belongsTo(() => Category)
  declare category: BelongsTo<typeof Category>
}
