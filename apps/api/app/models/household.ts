import Account from '#models/account'
import Category from '#models/category'
import Invitation from '#models/invitation'
import CategoryGroup from '#models/category_group'
import HouseholdMember from '#models/household_member'
import { HouseholdSchema } from '#database/schema'
import { hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'

/** Tenancy root: every resource hangs from a household. */
export default class Household extends HouseholdSchema {
  @hasMany(() => HouseholdMember)
  declare members: HasMany<typeof HouseholdMember>

  @hasMany(() => Invitation)
  declare invitations: HasMany<typeof Invitation>

  @hasMany(() => Account)
  declare accounts: HasMany<typeof Account>

  @hasMany(() => CategoryGroup)
  declare categoryGroups: HasMany<typeof CategoryGroup>

  @hasMany(() => Category)
  declare categories: HasMany<typeof Category>

  get isPendingDeletion() {
    return this.status === 'pending_deletion'
  }
}
