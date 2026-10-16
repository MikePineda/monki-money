import Clock from '#services/clock'
import { inject } from '@adonisjs/core'
import type Household from '#models/household'
import db from '@adonisjs/lucid/services/db'
import RecurringItem from '#models/recurring_item'
import { todayIn } from '#domain/calendar/month'
import { addDays } from '#domain/importing/iso_days'
import { hasPrivateOwner } from '#domain/ledger/privacy'
import { YEARLY_WINDOW_DAYS, detectRecurring } from '#domain/recurring/detection'
import { householdMemberIds } from '#services/ledger/privacy_viewer'
import type { DetectionResult } from '#services/recurring/dto'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import MerchantPaymentsRepository from '#repositories/merchant_payments_repository'
import { planRedetection, type TrackedItem } from '#domain/recurring/redetection'
import { householdIdOf, type HouseholdRef } from '#models/mixins/household_scoped'

/**
 * How far back detection reads the ledger: two years, which only yearly
 * payments use (every other cadence looks at the last twelve months).
 */
export const DETECTION_WINDOW_DAYS = YEARLY_WINDOW_DAYS

/** Namespace of the advisory lock on a household's recurring items (unique in the app). */
const RECURRING_LOCK_NAMESPACE = 52_017

/**
 * Serializes the writers of a household's recurring items (a detection run,
 * a person's edit) until `trx` ends, so two runs never insert the same
 * merchant twice and a run never overwrites an edit it did not see.
 */
export async function lockRecurringItems(household: HouseholdRef, trx: TransactionClientContract) {
  await trx.rawQuery('SELECT pg_advisory_xact_lock(?, ?)', [
    RECURRING_LOCK_NAMESPACE,
    householdIdOf(household),
  ])
}

function trackedOf(item: RecurringItem): TrackedItem {
  return {
    id: item.id,
    merchantKey: item.merchantKey,
    payee: item.payee,
    cadence: item.cadence,
    amountCents: item.amountCents,
    categoryId: item.categoryId,
    accountId: item.accountId,
    paidByUserId: item.paidByUserId,
    lastPaidDate: item.lastPaidDate,
    nextExpectedDate: item.nextExpectedDate,
    occurrences: item.occurrences,
    status: item.status,
    source: item.source,
    editedFields: item.editedFields,
  }
}

/**
 * Finds the household's recurring payments in its spending (the last
 * twelve months; two years for yearly ones, app/domain/recurring/detection.ts)
 * and lands them on the items it already tracks
 * (app/domain/recurring/redetection.ts): an idempotent upsert that never
 * brings back a dismissed item nor overwrites what a person edited, and
 * pauses a detected item whose payments stopped. Private purchases are never read: an
 * item is shared by the whole household. Costs two reads and the writes
 * of what changed, so it also runs after every confirmed import.
 */
@inject()
export default class RecurringDetector {
  constructor(
    protected payments: MerchantPaymentsRepository,
    protected clock: Clock
  ) {}

  async detect(household: Household): Promise<DetectionResult> {
    const today = todayIn(this.clock.now(), household.timezone)
    const memberIds = await householdMemberIds(household)
    const payments = await this.payments.between(
      household,
      addDays(today, -DETECTION_WINDOW_DAYS),
      today
    )
    const visible = payments.filter((payment) => !hasPrivateOwner(payment, memberIds))
    const detected = detectRecurring(visible, { today })
    // The latest payment of every merchant and payee key (payments are oldest first).
    const lastSeen = new Map<string, string>()
    for (const payment of visible) {
      for (const key of [payment.merchantKey, payment.payeeKey]) {
        if (key) lastSeen.set(key, payment.date)
      }
    }

    return db.transaction(async (trx) => {
      await lockRecurringItems(household, trx)
      const items = await RecurringItem.query({ client: trx }).where('household_id', household.id)
      const plan = planRedetection(items.map(trackedOf), detected, today, lastSeen)

      for (const found of plan.create) {
        await RecurringItem.create(
          {
            householdId: household.id,
            merchantKey: found.merchantKey,
            payee: found.payee,
            cadence: found.cadence,
            amountCents: found.amountCents,
            lastPaidDate: found.lastPaidDate,
            nextExpectedDate: found.nextExpectedDate,
            occurrences: found.occurrences,
            categoryId: found.categoryId,
            accountId: found.accountId,
            paidByUserId: found.paidByUserId,
            status: 'active',
            source: 'detected',
          },
          { client: trx }
        )
      }
      const byId = new Map(items.map((item) => [item.id, item]))
      for (const { id, changes } of plan.update) {
        const item = byId.get(id)!
        item.useTransaction(trx)
        await item.merge(changes).save()
      }
      return { created: plan.create.length, updated: plan.update.length }
    })
  }
}
