import webpush from 'web-push'
import type VapidKeys from '#services/push/vapid_keys'
import { angularPushMessage, type PushPayload } from '#domain/push/push_payload'
import {
  PushSender,
  type PushDelivery,
  type PushOptions,
  type PushTarget,
} from '#services/push/push_sender'

/** Socket timeout of one request to a push service. */
const TIMEOUT_MS = 10_000

/** Status codes that mean the subscription is gone for good. */
const GONE = new Set([404, 410])

/**
 * Production sender: the `web-push` library signs the request with the
 * VAPID pair (VapidKeys) and encrypts the payload (aes128gcm) for the push
 * service named by the endpoint (FCM, Mozilla, Apple). The payload is the
 * Angular service worker's notification format.
 */
export default class WebPushSender extends PushSender {
  constructor(protected vapid: VapidKeys) {
    super()
  }

  async send(
    target: PushTarget,
    payload: PushPayload,
    options: PushOptions
  ): Promise<PushDelivery> {
    const vapidDetails = await this.vapid.details()
    if (!vapidDetails) {
      return { status: 'failed', error: 'E_PUSH_UNAVAILABLE: no VAPID key pair', statusCode: null }
    }
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify(angularPushMessage(payload)),
        { vapidDetails, TTL: options.ttlSeconds, urgency: 'normal', timeout: TIMEOUT_MS }
      )
      return { status: 'sent' }
    } catch (error) {
      if (error instanceof webpush.WebPushError) {
        if (GONE.has(error.statusCode)) return { status: 'gone', statusCode: error.statusCode }
        return {
          status: 'failed',
          error: `E_PUSH_REJECTED: ${error.statusCode}`,
          statusCode: error.statusCode,
        }
      }
      const message = error instanceof Error ? error.message : String(error)
      return { status: 'failed', error: `E_PUSH_FAILED: ${message}`, statusCode: null }
    }
  }
}
