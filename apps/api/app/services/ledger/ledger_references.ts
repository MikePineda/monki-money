import Account from '#models/account'
import Category from '#models/category'
import { FieldError } from '#exceptions/field_error'
import { idsInHousehold } from '#repositories/scoped'
import type { HouseholdRef } from '#models/mixins/household_scoped'
import { assertMemberOf } from '#services/households/membership_lookup'
import { householdIdOf } from '#models/mixins/household_scoped'

/**
 * Foreign-key guards for ids sent in a ledger request body: anything that
 * is not part of the household answers 422 `<field>`/`database.exists`
 * (never 404, which is for the resource in the path).
 */
export default class LedgerReferences {
  /** The account (with its cards, for the default payer) or 422. */
  async account(household: HouseholdRef, accountId: number, field = 'accountId') {
    const account = await Account.query()
      .where('household_id', householdIdOf(household))
      .where('id', accountId)
      .preload('cards')
      .first()
    if (!account) throw new FieldError(field, 'database.exists')
    return account
  }

  async categories(household: HouseholdRef, ids: Array<number | null | undefined>, field: string) {
    const wanted = [...new Set(ids.filter((id): id is number => typeof id === 'number'))]
    const owned = await idsInHousehold(Category, household, wanted)
    if (wanted.some((id) => !owned.has(id))) throw new FieldError(field, 'database.exists')
  }

  async payer(household: HouseholdRef, userId: number | null | undefined) {
    if (typeof userId === 'number') await assertMemberOf(household, userId, 'paidByUserId')
  }
}
