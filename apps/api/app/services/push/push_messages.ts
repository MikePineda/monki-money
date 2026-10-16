import { DateTime } from 'luxon'
import i18nManager from '@adonisjs/i18n/services/main'
import { isLocale, type Locale } from '@monkimoney/shared'
import type { Month } from '#domain/calendar/month'
import type { PushPayload } from '#domain/push/push_payload'

/**
 * The text of every push notification, in the recipient's language
 * (`resources/lang/<locale>/messages.json`, keys `push.<kind>.title|body`).
 * Nothing here may name an amount, a merchant or a person: notifications
 * show on a lock screen. The summary names its month only.
 */

/** Luxon locale per app language, for month names. */
const DATE_LOCALES: Record<Locale, string> = { en: 'en-AU', es: 'es-MX' }

function languageOf(locale: string): Locale {
  return isLocale(locale) ? locale : 'en'
}

function translate(locale: string, kind: string, data: Record<string, string> = {}) {
  const i18n = i18nManager.locale(languageOf(locale))
  return {
    title: i18n.t(`messages.push.${kind}.title`, data),
    body: i18n.t(`messages.push.${kind}.body`, data),
  }
}

/** The month's name in `locale` ('2026-09' -> 'September' / 'septiembre'). */
export function monthName(month: Month, locale: string): string {
  return DateTime.fromISO(`${month}-01`, { zone: 'UTC' })
    .setLocale(DATE_LOCALES[languageOf(locale)])
    .toFormat('LLLL')
}

/** "Your September summary is ready": opens that month. */
export function summaryReadyPayload(month: Month, locale: string): PushPayload {
  return {
    ...translate(locale, 'summaryReady', { month: monthName(month, locale) }),
    url: `/month/${month}`,
    tag: `summary-${month}`,
  }
}

/** "Did you log anything today?": opens quick add. One tag, so today's replaces yesterday's. */
export function dailyReminderPayload(locale: string): PushPayload {
  return { ...translate(locale, 'dailyReminder'), url: '/add', tag: 'daily-reminder' }
}

/** `node ace push:test`: opens the notification settings. */
export function testPayload(locale: string): PushPayload {
  return { ...translate(locale, 'test'), url: '/settings', tag: 'push-test' }
}
