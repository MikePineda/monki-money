import type { PushPayload } from '#domain/push/push_payload'

/** A browser's subscription: where to post and the keys that encrypt the payload. */
export interface PushTarget {
  endpoint: string
  p256dh: string
  auth: string
}

export interface PushOptions {
  /** How long the push service keeps an undelivered message (phone off). */
  ttlSeconds: number
}

/**
 * - `sent`: the push service accepted the message.
 * - `gone`: 404/410, the subscription no longer exists (delete it).
 * - `failed`: anything else (push service down, timeout, no VAPID keys);
 *   `error` names the cause without the endpoint.
 */
export type PushDelivery =
  | { status: 'sent' }
  | { status: 'gone'; statusCode: number }
  | { status: 'failed'; error: string; statusCode: number | null }

/**
 * Delivers one push message to one device. An abstract class so it works
 * as a container token: `WebPushSender` in production, `FakePushSender`
 * (recording, scriptable) in tests. Never throws: a failure is a delivery.
 */
export abstract class PushSender {
  abstract send(
    target: PushTarget,
    payload: PushPayload,
    options: PushOptions
  ): Promise<PushDelivery>
}
