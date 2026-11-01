import Account from '#models/account'
import Household from '#models/household'
import { compose } from '@adonisjs/core/helpers'
import { belongsTo } from '@adonisjs/lucid/orm'
import { LinkedHolderAccountSchema } from '#database/schema'
import { HouseholdScoped } from '#models/mixins/household_scoped'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import type { LinkedHolderAccount as LinkedHolderValue } from '#domain/importing/types'

/**
 * One account a linked holder's internal transfers were confirmed to
 * (`holderKey` = `linkedHolderKey`, `linked acc trns smith jo`). A holder
 * may have several: the importer proposes the account only when it has one.
 */
export default class LinkedHolderAccount extends compose(
  LinkedHolderAccountSchema,
  HouseholdScoped
) {
  @belongsTo(() => Household)
  declare household: BelongsTo<typeof Household>

  @belongsTo(() => Account)
  declare account: BelongsTo<typeof Account>

  /** The plain value the import pipeline works with. */
  toValue(): LinkedHolderValue {
    return { holderKey: this.holderKey, accountId: this.accountId }
  }
}
