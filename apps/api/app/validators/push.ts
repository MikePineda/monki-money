import vine from '@vinejs/vine'
import { REMINDER_TIME_PATTERN } from '@monkimoney/shared'

/** A push service endpoint: always https (a capability URL, never logged). */
const endpoint = () =>
  vine
    .string()
    .trim()
    .maxLength(2048)
    .url({ protocols: ['https'], require_protocol: true })

/** URL-safe base64 as the browser exports the subscription keys. */
const base64url = (max: number) =>
  vine
    .string()
    .trim()
    .minLength(1)
    .maxLength(max)
    .regex(/^[\w-]+=*$/)

/** `POST /push/subscriptions`: `PushSubscription.toJSON()` of the browser. */
export const storePushSubscriptionValidator = vine.create({
  endpoint: endpoint(),
  expirationTime: vine.number().nullable().optional(),
  keys: vine.object({
    p256dh: base64url(200),
    auth: base64url(100),
  }),
})

/** `DELETE /push/subscriptions`: the endpoint in the body (it is a secret: never in the URL). */
export const destroyPushSubscriptionValidator = vine.create({
  endpoint: endpoint(),
})

/** `PATCH /me/notifications`: any subset. */
export const updateNotificationSettingsValidator = vine.create({
  summaryReady: vine.boolean({ strict: true }).optional(),
  dailyReminder: vine.boolean({ strict: true }).optional(),
  reminderTime: vine.string().regex(REMINDER_TIME_PATTERN).optional(),
})
