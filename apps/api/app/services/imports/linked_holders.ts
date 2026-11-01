import LinkedHolderAccount from '#models/linked_holder_account'
import { findInHousehold } from '#repositories/scoped'
import { LINKED_HOLDER_KEY_PREFIX } from '#domain/importing/linked_accounts'
import { householdIdOf, type HouseholdRef } from '#models/mixins/household_scoped'
import type { LinkedHolderAccount as LinkedHolderValue } from '#domain/importing/types'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

/** One holder as Settings lists it: the accounts its transfers were confirmed to. */
export interface LinkedHolderSummary {
  holderKey: string
  /** The holder as NAB names it, lower case (`morrow aj`). */
  holderName: string
  /** Confirmations over all its accounts. */
  confirmedCount: number
  /** The latest confirmation to any of its accounts. */
  lastConfirmedAt: LinkedHolderAccount['lastConfirmedAt']
  /** Its (holder, account) pairs, most confirmed first; `id` forgets one. */
  accounts: LinkedHolderAccount[]
}

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
   * Every holder of the household with its accounts, holders by key and
   * each holder's accounts most confirmed first (ties by id).
   */
  async summaries(household: HouseholdRef): Promise<LinkedHolderSummary[]> {
    const pairs = await LinkedHolderAccount.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .orderBy('holder_key')
      .orderBy('confirmed_count', 'desc')
      .orderBy('id')
    const holders = new Map<string, LinkedHolderSummary>()
    for (const pair of pairs) {
      const holder = holders.get(pair.holderKey)
      if (!holder) {
        holders.set(pair.holderKey, {
          holderKey: pair.holderKey,
          holderName: holderNameOf(pair.holderKey),
          confirmedCount: pair.confirmedCount,
          lastConfirmedAt: pair.lastConfirmedAt,
          accounts: [pair],
        })
        continue
      }
      holder.confirmedCount += pair.confirmedCount
      if (pair.lastConfirmedAt > holder.lastConfirmedAt)
        holder.lastConfirmedAt = pair.lastConfirmedAt
      holder.accounts.push(pair)
    }
    return [...holders.values()]
  }

  /**
   * Forgets one (holder, account) pair: the holder's next transfers no
   * longer count that account (with none left they ask again). 404 for
   * another household's or a missing id. A `merchant_rules` transfer rule
   * learned on the same key by an earlier release is not touched.
   */
  async forget(household: HouseholdRef, id: number): Promise<void> {
    const pair = await findInHousehold(LinkedHolderAccount, household, id)
    await pair.delete()
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

/** `linked acc trns morrow aj` -> `morrow aj`. */
function holderNameOf(holderKey: string): string {
  return holderKey.startsWith(LINKED_HOLDER_KEY_PREFIX)
    ? holderKey.slice(LINKED_HOLDER_KEY_PREFIX.length)
    : holderKey
}
