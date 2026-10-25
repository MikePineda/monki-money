import LinkedHolderAccount from '#models/linked_holder_account'
import { householdIdOf, type HouseholdRef } from '#models/mixins/household_scoped'
import type { LinkedHolderAccount as LinkedHolderValue } from '#domain/importing/types'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

/**
 * The accounts each linked holder's internal transfers were confirmed to
 * (`linked_holder_accounts`): read when staging and confirming, written by
 * the confirm step. A holder maps to a set of accounts, so a couple with
 * three accounts at the bank never sees every transfer of one holder sent
 * to whichever account was confirmed last.
 */
export default class LinkedHolders {
  async of(household: HouseholdRef, trx?: TransactionClientContract): Promise<LinkedHolderValue[]> {
    const rows = await LinkedHolderAccount.query({ client: trx })
      .withScopes((scopes) => scopes.forHousehold(household))
      .select('holder_key', 'account_id')
      .orderBy('id')
    return rows.map((row) => row.toValue())
  }

  /**
   * Adds each (holder, account) pair to the household's set, or counts the
   * new confirmations of it (one per row), in one statement per pair: two
   * confirms of the same holder at once never collide on the unique index.
   */
  async remember(
    household: HouseholdRef,
    entries: readonly LinkedHolderValue[],
    trx: TransactionClientContract
  ): Promise<void> {
    const now = new Date()
    const counted = new Map<string, { entry: LinkedHolderValue; count: number }>()
    for (const entry of entries) {
      const key = `${entry.holderKey}\u0000${entry.accountId}`
      const seen = counted.get(key)
      if (seen) seen.count++
      else counted.set(key, { entry, count: 1 })
    }
    for (const { entry, count } of counted.values()) {
      await trx
        .knexQuery()
        .table(LinkedHolderAccount.table)
        .insert({
          household_id: householdIdOf(household),
          holder_key: entry.holderKey,
          account_id: entry.accountId,
          confirmed_count: count,
          last_confirmed_at: now,
          created_at: now,
          updated_at: now,
        })
        .onConflict(['household_id', 'holder_key', 'account_id'])
        .merge({
          confirmed_count: trx.knexRawQuery(`${LinkedHolderAccount.table}.confirmed_count + ?`, [
            count,
          ]),
          last_confirmed_at: now,
          updated_at: now,
        })
    }
  }
}
