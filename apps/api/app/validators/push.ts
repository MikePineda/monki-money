import vine from '@vinejs/vine'
import { isReminderTime, isReminderWeekdays } from '@monkimoney/shared'
import type { FieldContext } from '@vinejs/vine/types'
import { isAuthSecret, isP256dhKey, isPushServiceEndpoint } from '#domain/push/push_subscription'

/** One of the push services the API sends to (domain/push/push_subscription.ts). */
const pushEndpointRule = vine.createRule((value: unknown, _: undefined, field: FieldContext) => {
  if (typeof value !== 'string' || !isPushServiceEndpoint(value)) {
    field.report('The {{ field }} is not a supported push service', 'pushEndpoint', field)
  }
})

const p256dhRule = vine.createRule((value: unknown, _: undefined, field: FieldContext) => {
  if (typeof value !== 'string' || !isP256dhKey(value)) {
    field.report('The {{ field }} is not a valid push key', 'pushKey', field)
  }
})

const authSecretRule = vine.createRule((value: unknown, _: undefined, field: FieldContext) => {
  if (typeof value !== 'string' || !isAuthSecret(value)) {
    field.report('The {{ field }} is not a valid push key', 'pushKey', field)
  }
})

const reminderTimeRule = vine.createRule((value: unknown, _: undefined, field: FieldContext) => {
  if (!isReminderTime(value)) {
    field.report('The {{ field }} must be a time from 00:00 to 23:30', 'reminderTime', field)
  }
})

const reminderWeekdaysRule = vine.createRule(
  (value: unknown, _: undefined, field: FieldContext) => {
    if (!isReminderWeekdays(value)) {
      field.report(
        'The {{ field }} must be one to seven distinct weekdays from 1 (Monday) to 7 (Sunday)',
        'reminderWeekdays',
        field
      )
    }
  }
)

/** ISO weekdays, Monday 1 to Sunday 7, each at most once (checked whole: one error for the field). */
const weekdays = () => vine.any().use(reminderWeekdaysRule())

/** A push service endpoint (a capability URL, never logged). */
const endpoint = () => vine.string().trim().maxLength(2048).use(pushEndpointRule())

/** `POST /push/subscriptions`: `PushSubscription.toJSON()` of the browser. */
export const storePushSubscriptionValidator = vine.create({
  endpoint: endpoint(),
  expirationTime: vine.number().nullable().optional(),
  keys: vine.object({
    p256dh: vine.string().trim().maxLength(200).use(p256dhRule()),
    auth: vine.string().trim().maxLength(100).use(authSecretRule()),
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
  reminderTime: vine.string().use(reminderTimeRule()).optional(),
  reminderWeekdays: weekdays().optional(),
})
