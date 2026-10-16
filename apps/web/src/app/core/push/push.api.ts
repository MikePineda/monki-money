import { Injectable, inject } from '@angular/core'
import type { NotificationSettings } from '@monkimoney/shared'
import { API } from '../api/api'

/** `PushSubscription.toJSON()` as the API takes it. */
export interface BrowserSubscription {
  endpoint: string
  expirationTime?: number | null
  keys: { p256dh: string; auth: string }
}

/**
 * Data access for Web Push: this device's subscription (by endpoint, in the
 * body: it is a capability URL) and the person's notification preferences.
 * Thin: every method is one typed Tuyau call.
 */
@Injectable({ providedIn: 'root' })
export class PushApi {
  private readonly api = inject(API)

  /** Registers (or refreshes) this device for the signed-in person; 404 when it is someone else's. */
  async subscribe(body: BrowserSubscription): Promise<void> {
    await (await this.api()).request('push.subscriptions.store', { body })
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
