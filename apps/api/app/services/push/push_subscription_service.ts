import type User from '#models/user'
import type Household from '#models/household'
import db from '@adonisjs/lucid/services/db'
import PushSubscription from '#models/push_subscription'
import { PushSubscriptionNotFound } from '#exceptions/errors'

/** `PushSubscription.toJSON()` as the browser hands it over. */
export interface SubscriptionInput {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/** Longest user agent kept (enough to tell two phones apart). */
const USER_AGENT_LENGTH = 255

/**
 * The devices a person registered for Web Push. An endpoint belongs to the
 * person who registered it: another person (a partner, someone in another
 * household) presenting the same endpoint gets 404 and changes nothing,
 * and their browser subscribes anew instead (a new endpoint).
 */
export default class PushSubscriptionService {
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
        await existing.merge({ ...values, failures: 0 }).save()
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
      return { subscription, created: inserted.length > 0 }
    })
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
