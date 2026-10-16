import type PushSubscription from '#models/push_subscription'
import { BaseTransformer } from '@adonisjs/core/transformers'
import { isoTimestamp } from '#domain/time/iso_timestamp'

/**
 * One of the person's push devices. Never the keys; the endpoint only goes
 * back to the browser that just sent it.
 */
export default class PushSubscriptionTransformer extends BaseTransformer<PushSubscription> {
  toObject() {
    return {
      id: this.resource.id,
      endpoint: this.resource.endpoint,
      userAgent: this.resource.userAgent,
      lastUsedAt: isoTimestamp(this.resource.lastUsedAt),
      createdAt: isoTimestamp(this.resource.createdAt)!,
    }
  }
}
