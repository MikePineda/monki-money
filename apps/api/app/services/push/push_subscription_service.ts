import { DateTime } from 'luxon'
import type User from '#models/user'
import type Household from '#models/household'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import PushSubscription from '#models/push_subscription'
import { PushSubscriptionNotFound } from '#exceptions/errors'

/** `PushSubscription.toJSON()` as the browser hands it over. */
export interface SubscriptionInput {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/** Longest user agent kept (enough to tell two phones apart). */
const USER_AGENT_LENGTH = 255

/** Devices kept per person: registering another one drops the least recently registered. */
export const MAX_DEVICES_PER_PERSON = 10

/**
 * The devices a person registered for Web Push. An endpoint belongs to the
 * person who registered it: another person (a partner, someone in another
 * household) presenting the same endpoint gets 404 and changes nothing,
 * and their browser subscribes anew instead (a new endpoint). A person
 * keeps at most MAX_DEVICES_PER_PERSON devices.
 */
export default class PushSubscriptionService {
  /**
   * Devices follow their person, not the household they subscribed in: on
   * joining (invitation) or creating a household every device of `userId`
   * moves there, and on leaving (`householdId` null) they are detached, so
   * nothing is sent to them until the person belongs to a household again.
   * Runs in the caller's transaction; `updated_at` is left alone (it orders
   * the device cap).
   */
  static async followPerson(
    userId: number,
    householdId: number | null,
    client: TransactionClientContract
  ): Promise<void> {
    await PushSubscription.query({ client })
      .where('user_id', userId)
      .update({ household_id: householdId })
  }

  /**
   * Upsert by endpoint for `user`: new keys, user agent and current
   * household on an endpoint they registered before (also from a household
   * they left), or a new row. 404 when the endpoint is someone else's.
   */
  async subscribe(
    household: Household,
    user: User,
    input: SubscriptionInput,
    userAgent: string | null
  ): Promise<{ subscription: PushSubscription; created: boolean }> {
    return db.transaction(async (trx) => {
      const values = {
        householdId: household.id,
        userId: user.id,
        endpoint: input.endpoint,
        p256Dh: input.keys.p256dh,
        auth: input.keys.auth,
        userAgent: userAgent?.slice(0, USER_AGENT_LENGTH) || null,
      }
      const existing = await PushSubscription.query({ client: trx })
        .where('endpoint', input.endpoint)
        .forUpdate()
        .first()
      if (existing && existing.userId !== user.id) throw new PushSubscriptionNotFound()
      if (existing) {
        // A refresh counts as recent for the device cap, even when nothing else changed.
        await existing.merge({ ...values, failures: 0, updatedAt: DateTime.now() }).save()
        return { subscription: existing, created: false }
      }

      // Two tabs of one browser may subscribe at once: the loser re-reads.
      const inserted = await trx
        .knexQuery()
        .table(PushSubscription.table)
        .insert({
          household_id: values.householdId,
          user_id: values.userId,
          endpoint: values.endpoint,
          p256dh: values.p256Dh,
          auth: values.auth,
          user_agent: values.userAgent,
          failures: 0,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .onConflict('endpoint')
        .ignore()
        .returning('id')
      const subscription = await PushSubscription.query({ client: trx })
        .where('endpoint', input.endpoint)
        .firstOrFail()
      if (subscription.userId !== user.id) throw new PushSubscriptionNotFound()
      if (inserted.length > 0) await this.keepNewestDevices(user, trx)
      return { subscription, created: inserted.length > 0 }
    })
  }

  /** Drops the person's devices beyond the cap, least recently registered (or refreshed) first. */
  protected async keepNewestDevices(user: User, trx: TransactionClientContract) {
    const kept = await PushSubscription.query({ client: trx })
      .where('user_id', user.id)
      .orderBy('updated_at', 'desc')
      .orderBy('id', 'desc')
      .limit(MAX_DEVICES_PER_PERSON)
      .select('id')
    await PushSubscription.query({ client: trx })
      .where('user_id', user.id)
      .whereNotIn(
        'id',
        kept.map((device) => device.id)
      )
      .delete()
  }

  /** Forgets one of the person's devices in this household; 404 for any other endpoint. */
  async unsubscribe(household: Household, user: User, endpoint: string): Promise<void> {
    const subscription = await PushSubscription.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .where('user_id', user.id)
      .where('endpoint', endpoint)
      .first()
    if (!subscription) throw new PushSubscriptionNotFound()
    await subscription.delete()
  }
}
