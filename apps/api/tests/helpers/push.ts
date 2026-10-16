import type User from '#models/user'
import { randomUUID } from 'node:crypto'
import app from '@adonisjs/core/services/app'
import type Household from '#models/household'
import PushSubscription from '#models/push_subscription'
import { PushSender } from '#services/push/push_sender'
import FakePushSender from '#services/push/fake_push_sender'
import UserNotificationSetting from '#models/user_notification_setting'
import type { NotificationSettings } from '@monkimoney/shared'

type Cleanup = (callback: () => void) => void

/** Laravel's `Notification::fake()` for Web Push: a fresh recording sender for this test. */
export function fakePush(cleanup: Cleanup): FakePushSender {
  const sender = new FakePushSender()
  app.container.swap(PushSender, () => sender)
  cleanup(() => app.container.restore(PushSender))
  return sender
}

/** A synthetic push service endpoint (unique per call). */
export function anEndpoint(service = 'push.example.test'): string {
  return `https://${service}/send/${randomUUID()}`
}

/** What `PushSubscription.toJSON()` gives the browser (synthetic keys). */
export function aBrowserSubscription(endpoint = anEndpoint()) {
  return {
    endpoint,
    expirationTime: null,
    keys: {
      p256dh:
        'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
      auth: 'tBHItJI5svbpez7KI4CCXg',
    },
  }
}

/** A device of `user` registered in `household`, straight in the table. */
export async function subscribeDevice(
  user: User,
  household: Household,
  overrides: Partial<{ endpoint: string; userAgent: string | null; failures: number }> = {}
): Promise<PushSubscription> {
  const browser = aBrowserSubscription(overrides.endpoint)
  return PushSubscription.create({
    householdId: household.id,
    userId: user.id,
    endpoint: browser.endpoint,
    p256Dh: browser.keys.p256dh,
    auth: browser.keys.auth,
    userAgent: overrides.userAgent === undefined ? 'Test browser' : overrides.userAgent,
    failures: overrides.failures ?? 0,
  })
}

/** Saves a person's notification preferences (the rest keep their defaults). */
export async function preferNotifications(user: User, settings: Partial<NotificationSettings>) {
  return UserNotificationSetting.updateOrCreate({ userId: user.id }, settings)
}
