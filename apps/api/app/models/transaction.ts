import User from '#models/user'
import Account from '#models/account'
import Category from '#models/category'
import Transfer from '#models/transfer'
import Household from '#models/household'
import { compose } from '@adonisjs/core/helpers'
import { TransactionSchema } from '#database/schema'
import TransactionSplit from '#models/transaction_split'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import { HouseholdScoped } from '#models/mixins/household_scoped'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'

/**
 * A ledger row. `amountCents` is signed (negative leaves the account);
 * `paidByUserId` null means joint. A split transaction (`isSplit`) has no
 * category: its lines (`splits`) carry them. A transfer leg (`kind
 * 'transfer'`) belongs to a `Transfer` and is edited through it.
 */
export default class Transaction extends compose(TransactionSchema, HouseholdScoped) {
  @belongsTo(() => Household)
  declare household: BelongsTo<typeof Household>

  @belongsTo(() => Account)
  declare account: BelongsTo<typeof Account>

  @belongsTo(() => Category)
  declare category: BelongsTo<typeof Category>

  @belongsTo(() => Transfer)
  declare transfer: BelongsTo<typeof Transfer>

  @belongsTo(() => User, { foreignKey: 'paidByUserId' })
  declare paidBy: BelongsTo<typeof User>

  @hasMany(() => TransactionSplit)
  declare splits: HasMany<typeof TransactionSplit>

  get isTransferLeg() {
    return this.kind === 'transfer'
  }
}
