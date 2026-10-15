import Account from '#models/account'
import Household from '#models/household'
import Transaction from '#models/transaction'
import { compose } from '@adonisjs/core/helpers'
import { TransferSchema } from '#database/schema'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import { HouseholdScoped } from '#models/mixins/household_scoped'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'

/**
 * Money moved between two accounts of the household. The amounts live in
 * its two legs (`legs`, kind `transfer`): negative on `fromAccount`,
 * positive on `toAccount`. Always written through TransferService so the
 * legs never drift from this row.
 */
export default class Transfer extends compose(TransferSchema, HouseholdScoped) {
  @belongsTo(() => Household)
  declare household: BelongsTo<typeof Household>

  @belongsTo(() => Account, { foreignKey: 'fromAccountId' })
  declare fromAccount: BelongsTo<typeof Account>

  @belongsTo(() => Account, { foreignKey: 'toAccountId' })
  declare toAccount: BelongsTo<typeof Account>

  @hasMany(() => Transaction)
  declare legs: HasMany<typeof Transaction>
}
