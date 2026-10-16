import Household from '#models/household'
import { belongsTo } from '@adonisjs/lucid/orm'
import { compose } from '@adonisjs/core/helpers'
import { RecurringItemSchema } from '#database/schema'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { HouseholdScoped } from '#models/mixins/household_scoped'

/**
 * A recurring payment of a household (rent, phone, gym, a subscription):
 * one per merchant key, detected from the ledger or typed by a person.
 * `editedFields` lists what a person changed, which detection never
 * overwrites (app/domain/recurring/redetection.ts).
 */
export default class RecurringItem extends compose(RecurringItemSchema, HouseholdScoped) {
  @belongsTo(() => Household)
  declare household: BelongsTo<typeof Household>
}
