/**
 * Push notification preferences of one person (`PATCH /me/notifications`).
 * The summary push says the monthly summary is ready; the daily reminder
 * asks, once a day after `reminderTime` (household time zone), whether
 * anything was logged today, and only when nothing was.
 */

/** `data` of `GET` / `PATCH /api/v1/me/notifications`. */
export interface NotificationSettings {
  /** "Your summary of {month} is ready" on the 1st. */
  summaryReady: boolean
  /** "Did you log anything today?" when nothing was logged by `reminderTime`. */
  dailyReminder: boolean
  /** 24-hour 'HH:mm' in the household time zone. */
  reminderTime: string
}

/** What a person without a saved choice gets. */
export const DEFAULT_NOTIFICATION_SETTINGS: Readonly<NotificationSettings> = Object.freeze({
  summaryReady: true,
  dailyReminder: false,
  reminderTime: '20:00',
})

/** 24-hour 'HH:mm', 00:00 to 23:59. */
export const REMINDER_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export function isReminderTime(value: unknown): value is string {
  return typeof value === 'string' && REMINDER_TIME_PATTERN.test(value)
}

/** Minutes from midnight of an 'HH:mm' reminder time ('20:00' -> 1200). */
export function reminderMinutes(time: string): number {
  if (!isReminderTime(time)) throw new RangeError(`Not a reminder time (HH:mm): ${time}`)
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
}
