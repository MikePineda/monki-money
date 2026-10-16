import Account from '#models/account'
import Transaction from '#models/transaction'
import type { HouseholdRef } from '#models/mixins/household_scoped'

/**
 * The active account of the latest expense or income `user` entered
 * (newest created first), or null: quick add's default account on the
 * server (`POST /transactions/quick`) and in its suggestions.
 */
export async function lastAccountUsed(
  household: HouseholdRef,
  user: { id: number }
): Promise<number | null> {
  const last = await Transaction.query()
    .withScopes((scopes) => scopes.forHousehold(household))
    .where('created_by_user_id', user.id)
    .whereNot('kind', 'transfer')
    .whereHas('account', (account) => account.where('is_active', true))
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .first()
  return last?.accountId ?? null
}

/** The household's first active account in its display order, or null. */
export async function firstActiveAccount(household: HouseholdRef): Promise<number | null> {
  const first = await Account.query()
    .withScopes((scopes) => scopes.forHousehold(household))
    .where('is_active', true)
    .orderBy('sort_order')
    .orderBy('id')
    .first()
  return first?.id ?? null
}
