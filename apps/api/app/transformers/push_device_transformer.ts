import type PushSubscription from '#models/push_subscription'
import { BaseTransformer } from '@adonisjs/core/transformers'
import { deviceLabel } from '#domain/push/device_label'
import { isoTimestamp } from '#domain/time/iso_timestamp'

/**
 * One of the person's push devices as Settings lists it: what it is and
 * when it last got a notification. Never the endpoint (a capability URL)
 * nor the keys.
 */
export default class PushDeviceTransformer extends BaseTransformer<PushSubscription> {
  toObject() {
    const { browser, platform } = deviceLabel(this.resource.userAgent)
    return {
      id: this.resource.id,
      browser,
      platform,
      lastUsedAt: isoTimestamp(this.resource.lastUsedAt),
      createdAt: isoTimestamp(this.resource.createdAt)!,
    }
  }
}
