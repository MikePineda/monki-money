import { Injectable, inject } from '@angular/core'
import type { NotificationSettings } from '@monkimoney/shared'
import { API } from '../api/api'

/** `PushSubscription.toJSON()` as the API takes it. */
export interface BrowserSubscription {
  endpoint: string
  expirationTime?: number | null
  keys: { p256dh: string; auth: string }
}

/** One of the person's devices as Settings lists it (never its endpoint). */
export interface PushDevice {
  id: number
  /** 'Safari', 'Chrome'... from its user agent; null when unknown. */
  browser: string | null
  /** 'iPhone', 'Android', 'macOS'...; null when unknown. */
  platform: string | null
  /** The last notification it got (ISO timestamp), null before the first. */
  lastUsedAt: string | null
  createdAt: string
}

/**
 * Data access for Web Push: this device's subscription (by endpoint, in the
 * body: it is a capability URL), the person's devices (by id) and their
 * notification preferences. Thin: every method is one typed Tuyau call.
 */
@Injectable({ providedIn: 'root' })
export class PushApi {
  private readonly api = inject(API)

  /**
   * Registers (or refreshes) this device for the signed-in person and answers
   * its id; 404 when it is someone else's.
   */
  async subscribe(body: BrowserSubscription): Promise<{ id: number }> {
    const { data } = await (await this.api()).request('push.subscriptions.store', { body })
    return { id: data.id }
  }

  /** The person's devices in the current household, oldest first. */
  async devices(): Promise<PushDevice[]> {
    const { data } = await (await this.api()).request('push.subscriptions.index', {})
    return data
  }

  /** Forgets one of the person's devices; 404 when it is not theirs (or already gone). */
  async removeDevice(id: number): Promise<void> {
    await (await this.api()).request('push.subscriptions.remove', { params: { id } })
  }

  async unsubscribe(endpoint: string): Promise<void> {
    await (await this.api()).request('push.subscriptions.destroy', { body: { endpoint } })
  }

  async settings(): Promise<NotificationSettings> {
    const { data } = await (await this.api()).request('me.notifications.show', {})
    return data
  }

  async updateSettings(body: Partial<NotificationSettings>): Promise<NotificationSettings> {
    const { data } = await (await this.api()).request('me.notifications.update', { body })
    return data
  }
}
