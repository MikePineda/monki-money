import { Injectable, inject, signal } from '@angular/core'
import { SwPush } from '@angular/service-worker'
import { sameServerKey } from '../../domain/push'
import { hasStatus, toApiError } from '../api/http-errors'
import { ConfigStore } from '../auth/config.store'
import { WINDOW } from '../platform/window.token'
import { PushApi, type BrowserSubscription } from './push.api'
import { currentSubscription } from './push-device'

/**
 * Web Push on this device:
 * - `unsupported`: no service worker or no Push API (iOS only has it in the
 *   installed app, from 16.4);
 * - `unavailable`: the server has no VAPID key;
 * - `denied`: the person blocked notifications for the app;
 * - `off`: supported, not subscribed (or subscribed for someone else);
 * - `on`: subscribed, and the API knows this device for the signed-in person.
 */
export type PushState = 'unsupported' | 'unavailable' | 'denied' | 'off' | 'on'

/** The window's Notification API (a global, not a `Window` property in the DOM typings). */
type WithNotifications = Window & { Notification: typeof Notification }

/** How long to wait for the service worker before treating the device as not subscribed. */
const SUBSCRIPTION_WAIT_MS = 10_000

/**
 * Wraps Angular's SwPush: subscribing (permission prompt, then
 * `requestSubscription` with the VAPID key from `GET /config`), keeping the
 * API's copy in sync (a rotated key subscribes again, a moved household is
 * re-registered) and unsubscribing. A tapped notification is routed by
 * `followNotificationClicks` (notification-clicks.ts, SwPush's
 * `notificationClicks`), started at app start. Loaded on demand with the
 * settings screen, never part of the initial bundle. Nothing here stores a
 * push payload.
 */
@Injectable({ providedIn: 'root' })
export class PushService {
  // Absent where the service worker module is not provided (specs of other screens).
  private readonly sw = inject(SwPush, { optional: true })
  private readonly window = inject(WINDOW)
  private readonly api = inject(PushApi)
  private readonly config = inject(ConfigStore)
  private readonly registeredId = signal<number | null>(null)

  /** The API's id of this device once registered this session (marks it in the device list). */
  readonly deviceId = this.registeredId.asReadonly()

  /** Whether this browser can receive Web Push at all. */
  get supported(): boolean {
    return (
      this.sw?.isEnabled === true && 'PushManager' in this.window && 'Notification' in this.window
    )
  }

  /** This device's state; brings the API's copy of the subscription up to date on the way. */
  async state(): Promise<PushState> {
    if (!this.supported) {
      return 'unsupported'
    }
    const key = await this.serverKey()
    if (!key) {
      return 'unavailable'
    }
    const permission = this.permission()
    if (permission === 'denied') {
      return 'denied'
    }
    // Without the permission no subscription can exist: no need to wait for the worker.
    if (permission !== 'granted') {
      return 'off'
    }
    const current = await this.current()
    if (!current) {
      return 'off'
    }
    if (!sameServerKey(current.options.applicationServerKey, key)) {
      // The server's key changed (rotation): this subscription can never be delivered.
      await this.subscribeAnew(key)
      return 'on'
    }
    return (await this.register(current)) ? 'on' : 'off'
  }

  /**
   * Asks for permission (call it straight from a tap: iOS only prompts from a
   * user gesture), subscribes and registers the device. Throws when the API
   * refuses the subscription (offline, server error).
   */
  async enable(): Promise<PushState> {
    if (!this.supported) {
      return 'unsupported'
    }
    // Before any other await, so the prompt keeps the tap's user activation.
    const asked = this.requestPermission()
    const key = await this.serverKey()
    const permission = await asked
    if (!key) {
      return 'unavailable'
    }
    if (permission !== 'granted') {
      return permission === 'denied' ? 'denied' : 'off'
    }
    const current = await this.current()
    if (current && sameServerKey(current.options.applicationServerKey, key)) {
      if (await this.register(current)) {
        return 'on'
      }
    }
    await this.subscribeAnew(key)
    return 'on'
  }

  /** Forgets this device on the API (best effort) and unsubscribes the browser. */
  async disable(): Promise<PushState> {
    if (!this.supported) {
      return 'unsupported'
    }
    // Without the permission there is no subscription to drop.
    const current = this.permission() === 'granted' ? await this.current() : null
    if (current) {
      // A device the API cannot forget now stops anyway: its next push answers 410.
      await this.api.unsubscribe(current.endpoint).catch(() => undefined)
      await this.sw!.unsubscribe().catch(() => undefined)
    }
    this.registeredId.set(null)
    return 'off'
  }

  private permission(): NotificationPermission {
    return (this.window as WithNotifications).Notification.permission
  }

  private async requestPermission(): Promise<NotificationPermission> {
    const current = this.permission()
    if (current !== 'default') {
      return current
    }
    return (this.window as WithNotifications).Notification.requestPermission()
  }

  private async serverKey(): Promise<string | null> {
    const config = await this.config.load()
    return config?.vapidPublicKey ?? null
  }

  private current(): Promise<PushSubscription | null> {
    return currentSubscription(this.sw!, SUBSCRIPTION_WAIT_MS)
  }

  /** Tells the API about this device; false when the endpoint belongs to someone else (404). */
  private async register(subscription: PushSubscription): Promise<boolean> {
    try {
      this.remember(await this.api.subscribe(bodyOf(subscription)))
      return true
    } catch (error) {
      if (hasStatus(toApiError(error), 404)) {
        this.registeredId.set(null)
        return false
      }
      // Offline or a server error: the browser is subscribed, the next visit syncs it.
      return true
    }
  }

  /**
   * Drops whatever this browser holds (on the API too, best effort: a
   * stale or someone else's endpoint answers 404) and subscribes with `key`
   * for the signed-in person.
   */
  private async subscribeAnew(key: string): Promise<void> {
    const previous = await this.current()
    if (previous) {
      await this.api.unsubscribe(previous.endpoint).catch(() => undefined)
    }
    await this.sw!.unsubscribe().catch(() => undefined)
    const subscription = await this.sw!.requestSubscription({ serverPublicKey: key })
    this.remember(await this.api.subscribe(bodyOf(subscription)))
  }

  private remember(device: { id: number } | undefined): void {
    this.registeredId.set(device?.id ?? null)
  }
}

function bodyOf(subscription: PushSubscription): BrowserSubscription {
  const json = subscription.toJSON()
  return {
    endpoint: json.endpoint ?? subscription.endpoint,
    expirationTime: json.expirationTime ?? null,
    keys: { p256dh: json.keys?.['p256dh'] ?? '', auth: json.keys?.['auth'] ?? '' },
  }
}
