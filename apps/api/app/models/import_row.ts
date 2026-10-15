import Account from '#models/account'
import Category from '#models/category'
import Household from '#models/household'
import ImportBatch from '#models/import_batch'
import Transaction from '#models/transaction'
import { compose } from '@adonisjs/core/helpers'
import { belongsTo } from '@adonisjs/lucid/orm'
import { ImportRowSchema } from '#database/schema'
import { HouseholdScoped } from '#models/mixins/household_scoped'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

/**
 * One bank row of an import batch: what the pipeline proposed
 * (`resolution`, match, suggestion, transfer), what the person decided
 * (`decision`) and, once confirmed, the ledger row it became
 * (`transactionId`). `raw` holds the original cells: data, never HTML.
 */
export default class ImportRow extends compose(ImportRowSchema, HouseholdScoped) {
  @belongsTo(() => Household)
  declare household: BelongsTo<typeof Household>

  @belongsTo(() => ImportBatch)
  declare batch: BelongsTo<typeof ImportBatch>

  @belongsTo(() => Account)
  declare account: BelongsTo<typeof Account>

  @belongsTo(() => Category, { foreignKey: 'suggestedCategoryId' })
  declare suggestedCategory: BelongsTo<typeof Category>

  @belongsTo(() => Transaction, { foreignKey: 'matchTransactionId' })
  declare matchTransaction: BelongsTo<typeof Transaction>

  @belongsTo(() => Transaction)
  declare transaction: BelongsTo<typeof Transaction>

  /** Still waiting for confirm (superseded rows are done by definition). */
  get isOpen() {
    return this.confirmedAt === null && this.resolution !== 'superseded'
  }
}
