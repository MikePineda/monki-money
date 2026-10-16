import webpush from 'web-push'
import { Agent } from 'node:https'
import type VapidKeys from '#services/push/vapid_keys'
import { isPushServiceEndpoint } from '#domain/push/push_subscription'
import { angularPushMessage, type PushPayload } from '#domain/push/push_payload'
import {
  PushSender,
  type PushDelivery,
  type PushSendOptions,
  type PushTarget,
} from '#services/push/push_sender'

/** Idle-socket timeout of one request (the hard deadline is PushNotifier's). */
const SOCKET_TIMEOUT_MS = 10_000

/** The send's deadline passed: its request was dropped. */
class SendAborted extends Error {}

/** Status codes that mean the subscription is gone for good. */
const GONE = new Set([404, 410])

/**
 * Production sender: the `web-push` library signs the request with the
 * VAPID pair (VapidKeys) and encrypts the payload (aes128gcm) for the push
 * service named by the endpoint (FCM, Mozilla, Apple, Windows). The payload
 * is the Angular service worker's notification format. Only endpoints of
 * the allowed push services are contacted (domain/push/push_subscription.ts,
 * also checked when a device subscribes). Each request gets its own agent,
 * destroyed when the send's deadline aborts it, so a slow answer cannot
 * keep a socket (and its buffered response) alive.
 */
export default class WebPushSender extends PushSender {
  constructor(protected vapid: Pick<VapidKeys, 'details'>) {
    super()
  }

  async send(
    target: PushTarget,
    payload: PushPayload,
    options: PushSendOptions
  ): Promise<PushDelivery> {
    if (!this.allows(target.endpoint)) {
      return {
        status: 'failed',
        error: 'E_PUSH_ENDPOINT: not a known push service',
        statusCode: null,
      }
    }
    const vapidDetails = await this.vapid.details()
    if (!vapidDetails) {
      return { status: 'failed', error: 'E_PUSH_UNAVAILABLE: no VAPID key pair', statusCode: null }
    }
    if (options.signal.aborted) {
      return { status: 'failed', error: 'E_PUSH_TIMEOUT: aborted', statusCode: null }
    }

    const agent = new Agent({ keepAlive: false })
    let drop = () => {}
    const aborted = new Promise<never>((_resolve, reject) => {
      drop = () => {
        agent.destroy()
        reject(new SendAborted())
      }
      options.signal.addEventListener('abort', drop, { once: true })
    })
    try {
      await Promise.race([
        webpush.sendNotification(
          { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
          JSON.stringify(angularPushMessage(payload)),
          {
            vapidDetails,
            TTL: options.ttlSeconds,
            urgency: 'normal',
            timeout: SOCKET_TIMEOUT_MS,
            agent,
          }
        ),
        aborted,
      ])
      return { status: 'sent' }
    } catch (error) {
      if (error instanceof SendAborted) {
        return {
          status: 'failed',
          error: 'E_PUSH_TIMEOUT: dropped at the deadline',
          statusCode: null,
        }
      }
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
    } finally {
      options.signal.removeEventListener('abort', drop)
      agent.destroy()
    }
  }

  /** Only the allowed push services are contacted. */
  protected allows(endpoint: string): boolean {
    return isPushServiceEndpoint(endpoint)
  }
}
