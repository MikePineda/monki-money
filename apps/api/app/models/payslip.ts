import User from '#models/user'
import Account from '#models/account'
import Transfer from '#models/transfer'
import Household from '#models/household'
import Transaction from '#models/transaction'
import { compose } from '@adonisjs/core/helpers'
import { PayslipSchema } from '#database/schema'
import { belongsTo, hasMany } from '@adonisjs/lucid/orm'
import { HouseholdScoped } from '#models/mixins/household_scoped'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'

/**
 * A payout recorded in the account it arrived in (an umbrella service's
 * wallet): the gross income and its deductions live in `lines` (ledger
 * rows with `payslip_id`), the net left through `transfer`. Always written
 * through PayslipService, which keeps `gross - deductions = net`.
 */
export default class Payslip extends compose(PayslipSchema, HouseholdScoped) {
  @belongsTo(() => Household)
  declare household: BelongsTo<typeof Household>

  @belongsTo(() => Account)
  declare account: BelongsTo<typeof Account>

  /** Who earned it; null = joint. */
  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @belongsTo(() => Transfer)
  declare transfer: BelongsTo<typeof Transfer>

  /** The gross income row and one expense row per deduction. */
  @hasMany(() => Transaction)
  declare lines: HasMany<typeof Transaction>
}
