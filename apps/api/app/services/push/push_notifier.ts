import type { DateTime } from 'luxon'
import { inject } from '@adonisjs/core'
import PushSubscription from '#models/push_subscription'
import type { PushPayload } from '#domain/push/push_payload'
import { PushSender, type PushDelivery, type PushOptions } from '#services/push/push_sender'

/** What happened on each device of one notification. */
export interface PushReport {
  /** Devices that got it. */
  sent: number
  /** Devices whose subscription was gone (404/410) and was deleted. */
  gone: number
  /** Devices that failed for another reason (kept, `failures` + 1). */
  failed: number
  /** One line per failed device, never the endpoint. */
  errors: string[]
}

/**
 * The longest one send may take. web-push's own `timeout` only covers an
 * idle socket; past this the send is a failure and its request is dropped,
 * so a slow push service can never hold up the scheduler's tick.
 */
export const PUSH_SEND_TIMEOUT_MS = 10_000

/** Outcome of one device, for `node ace push:test`. */
export interface DeviceDelivery {
  subscription: PushSubscription
  delivery: PushDelivery
}

/**
 * Sends one notification to every device of a person and keeps the
 * subscriptions tidy: a delivered message stamps `last_used_at` and resets
 * `failures`, a 404/410 deletes the subscription, any other failure adds
 * one to `failures`. Every send has a hard deadline (PUSH_SEND_TIMEOUT_MS).
 * Never throws for a device's sake.
 */
@inject()
export default class PushNotifier {
  protected sendTimeoutMs = PUSH_SEND_TIMEOUT_MS

  constructor(protected sender: PushSender) {}

  /** The person's devices registered in their current household. */
  devicesOf(userId: number, householdId: number): Promise<PushSubscription[]> {
    return PushSubscription.query()
      .withScopes((scopes) => scopes.forHousehold(householdId))
      .where('user_id', userId)
      .orderBy('id')
  }

  async notify(
    devices: PushSubscription[],
    payload: PushPayload,
    options: PushOptions,
    now: DateTime
  ): Promise<PushReport> {
    return reportOf(await this.deliver(devices, payload, options, now))
  }

  async deliver(
    devices: PushSubscription[],
    payload: PushPayload,
    options: PushOptions,
    now: DateTime
  ): Promise<DeviceDelivery[]> {
    const deliveries: DeviceDelivery[] = []
    for (const subscription of devices) {
      const delivery = await this.sendOne(subscription, payload, options)
      if (delivery.status === 'sent') {
        await subscription.merge({ lastUsedAt: now, failures: 0 }).save()
      } else if (delivery.status === 'gone') {
        await subscription.delete()
      } else {
        await subscription.merge({ failures: Math.min(subscription.failures + 1, 32_000) }).save()
      }
      deliveries.push({ subscription, delivery })
    }
    return deliveries
  }

  protected async sendOne(
    subscription: PushSubscription,
    payload: PushPayload,
    options: PushOptions
  ): Promise<PushDelivery> {
    const deadline = new AbortController()
    let timer: NodeJS.Timeout | undefined
    const timedOut = new Promise<PushDelivery>((resolve) => {
      timer = setTimeout(() => {
        deadline.abort()
        resolve({
          status: 'failed',
          error: `E_PUSH_TIMEOUT: no answer within ${this.sendTimeoutMs} ms`,
          statusCode: null,
        })
      }, this.sendTimeoutMs)
    })
    try {
      return await Promise.race([
        this.sender.send(
          { endpoint: subscription.endpoint, p256dh: subscription.p256Dh, auth: subscription.auth },
          payload,
          { ...options, signal: deadline.signal }
        ),
        timedOut,
      ])
    } catch (error) {
      // Senders answer failures; this only guards against a bug in one.
      const message = error instanceof Error ? error.message : String(error)
      return { status: 'failed', error: `E_PUSH_FAILED: ${message}`, statusCode: null }
    } finally {
      clearTimeout(timer)
    }
  }
}

function reportOf(deliveries: DeviceDelivery[]): PushReport {
  const report: PushReport = { sent: 0, gone: 0, failed: 0, errors: [] }
  for (const { delivery } of deliveries) {
    if (delivery.status === 'sent') report.sent += 1
    else if (delivery.status === 'gone') report.gone += 1
    else {
      report.failed += 1
      report.errors.push(delivery.error)
    }
  }
  return report
}
