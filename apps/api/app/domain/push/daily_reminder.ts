import type { DateTime } from 'luxon'
import { EVERY_WEEKDAY, isReminderTime, reminderMinutes, type Weekday } from '@monkimoney/shared'

/**
 * When the opt-in daily reminder ("did you log anything today?") goes out:
 * once per local day (household time zone) on the weekdays the person
 * chose, from their reminder time until midnight, and only when they
 * created nothing that day. Pure:
 * `now` is always passed in.
 */

/** The person's local calendar day ('YYYY-MM-DD'): one reminder per day, the lock's period key. */
export function reminderDay(now: DateTime, zone: string): string {
  return now.setZone(zone).toFormat('yyyy-MM-dd')
}

/** Midnight that started the local day of `now`. */
export function startOfLocalDay(now: DateTime, zone: string): DateTime {
  return now.setZone(zone).startOf('day')
}

/**
 * From `reminderTime` ('HH:mm', local) to midnight, on the chosen weekdays
 * of the local calendar (ISO, Monday 1; every day when not given). An
 * unknown zone or a malformed time is never due.
 */
export function isDailyReminderDue(
  now: DateTime,
  zone: string,
  reminderTime: string,
  weekdays: readonly Weekday[] = EVERY_WEEKDAY
): boolean {
  const local = now.setZone(zone)
  if (!local.isValid || !isReminderTime(reminderTime)) return false
  if (!weekdays.includes(local.weekday as Weekday)) return false
  return local.hour * 60 + local.minute >= reminderMinutes(reminderTime)
}

/**
 * Whether any of the person's entries was created on the local day of `now`
 * (when it was recorded, not the date it is booked on: a receipt from last
 * week typed in today counts as logging today).
 */
export function loggedSomethingToday(createdAt: DateTime[], now: DateTime, zone: string): boolean {
  const today = reminderDay(now, zone)
  return createdAt.some((instant) => reminderDay(instant, zone) === today)
}
