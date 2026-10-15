import User from '#models/user'
import Account from '#models/account'
import Household from '#models/household'
import ImportRow from '#models/import_row'
import { compose } from '@adonisjs/core/helpers'
import { ImportBatchSchema } from '#database/schema'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import { HouseholdScoped } from '#models/mixins/household_scoped'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'

/**
 * One uploaded bank export for one account. Its rows wait for review while
 * `status` is `staged`; ImportService confirms (completed) or cancels it.
 * The `*Count` columns mirror its rows by resolution.
 */
export default class ImportBatch extends compose(ImportBatchSchema, HouseholdScoped) {
  @belongsTo(() => Household)
  declare household: BelongsTo<typeof Household>

  @belongsTo(() => Account)
  declare account: BelongsTo<typeof Account>

  @belongsTo(() => User, { foreignKey: 'uploadedByUserId' })
  declare uploadedBy: BelongsTo<typeof User>

  @hasMany(() => ImportRow)
  declare rows: HasMany<typeof ImportRow>

  get isStaged() {
    return this.status === 'staged'
  }
}
