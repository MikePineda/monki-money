import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import {
  isDailyReminderDue,
  loggedSomethingToday,
  reminderDay,
  startOfLocalDay,
} from '#domain/push/daily_reminder'

const BRISBANE = 'Australia/Brisbane'
const SYDNEY = 'Australia/Sydney'
const MEXICO_CITY = 'America/Mexico_City'

function at(iso: string) {
  return DateTime.fromISO(iso, { setZone: true })
}

test.group('Daily reminder: when it is due', () => {
  test('test_the_reminder_is_due_once_the_local_time_passes_the_reminder_time', ({ assert }) => {
    // 20:00 in Brisbane is 10:00 UTC.
    assert.isFalse(isDailyReminderDue(at('2026-10-16T09:59:00Z'), BRISBANE, '20:00'))
    assert.isTrue(isDailyReminderDue(at('2026-10-16T10:00:00Z'), BRISBANE, '20:00'))
    assert.isTrue(isDailyReminderDue(at('2026-10-16T13:59:00Z'), BRISBANE, '20:00'))
  })

  test('test_the_reminder_follows_the_reminder_time_of_the_person', ({ assert }) => {
    const sevenThirtyPm = at('2026-10-16T19:30:00+10:00')

    assert.isTrue(isDailyReminderDue(sevenThirtyPm, BRISBANE, '19:30'))
    assert.isTrue(isDailyReminderDue(sevenThirtyPm, BRISBANE, '07:00'))
    assert.isFalse(isDailyReminderDue(sevenThirtyPm, BRISBANE, '19:31'))
    assert.isFalse(isDailyReminderDue(sevenThirtyPm, BRISBANE, '21:00'))
  })

  test('test_the_same_instant_is_due_in_one_time_zone_and_not_in_another', ({ assert }) => {
    // 10:30 UTC: 20:30 in Brisbane, 04:30 in Mexico City.
    const instant = at('2026-10-16T10:30:00Z')

    assert.isTrue(isDailyReminderDue(instant, BRISBANE, '20:00'))
    assert.isFalse(isDailyReminderDue(instant, MEXICO_CITY, '20:00'))
    assert.isTrue(isDailyReminderDue(at('2026-10-17T02:00:00Z'), MEXICO_CITY, '20:00'))
  })

  test('test_the_reminder_is_not_due_after_midnight_until_the_time_comes_again', ({ assert }) => {
    // 00:15 on the 17th in Brisbane: a new day that has not reached 20:00 yet.
    assert.isFalse(isDailyReminderDue(at('2026-10-17T00:15:00+10:00'), BRISBANE, '20:00'))
  })

  test('test_daylight_saving_keeps_the_local_reminder_time', ({ assert }) => {
    // Sydney is UTC+10 in winter and UTC+11 in summer: 20:00 local both times.
    assert.isTrue(isDailyReminderDue(at('2026-07-01T10:00:00Z'), SYDNEY, '20:00'))
    assert.isFalse(isDailyReminderDue(at('2026-12-01T08:59:00Z'), SYDNEY, '20:00'))
    assert.isTrue(isDailyReminderDue(at('2026-12-01T09:00:00Z'), SYDNEY, '20:00'))
  })

  test('test_an_unknown_time_zone_or_reminder_time_is_never_due', ({ assert }) => {
    const instant = at('2026-10-16T12:00:00Z')

    assert.isFalse(isDailyReminderDue(instant, 'Mars/Olympus_Mons', '00:00'))
    assert.isFalse(isDailyReminderDue(instant, BRISBANE, '25:00'))
  })

  test('test_the_reminder_is_due_only_on_the_chosen_weekdays_in_the_household_time_zone', ({
    assert,
  }) => {
    // Friday 16 October 2026, 20:30 in Brisbane; still Friday 04:30 in Mexico City.
    const fridayEvening = at('2026-10-16T20:30:00+10:00')
    const weekdays = [1, 2, 3, 4, 5] as const
    const weekend = [6, 7] as const

    assert.isTrue(isDailyReminderDue(fridayEvening, BRISBANE, '20:00', [...weekdays]))
    assert.isFalse(isDailyReminderDue(fridayEvening, BRISBANE, '20:00', [...weekend]))
    // 20:30 on Friday in Mexico City is already Saturday 12:30 in Brisbane.
    const fridayInMexico = at('2026-10-16T20:30:00-06:00')
    assert.isTrue(isDailyReminderDue(fridayInMexico, MEXICO_CITY, '20:00', [5]))
    assert.isFalse(isDailyReminderDue(fridayInMexico, MEXICO_CITY, '20:00', [6]))
  })

  test('test_without_a_weekday_choice_every_day_is_a_reminder_day', ({ assert }) => {
    const sundayEvening = at('2026-10-18T20:30:00+10:00')

    assert.isTrue(isDailyReminderDue(sundayEvening, BRISBANE, '20:00'))
  })

  test('test_the_reminder_day_is_the_local_calendar_date', ({ assert }) => {
    // 15:00 UTC on the 16th is already the 17th in Brisbane.
    assert.equal(reminderDay(at('2026-10-16T15:00:00Z'), BRISBANE), '2026-10-17')
    assert.equal(reminderDay(at('2026-10-16T15:00:00Z'), MEXICO_CITY), '2026-10-16')
  })

  test('test_the_local_day_starts_at_midnight_in_the_time_zone', ({ assert }) => {
    const start = startOfLocalDay(at('2026-10-16T20:30:00+10:00'), BRISBANE)

    assert.equal(start.toUTC().toISO(), '2026-10-15T14:00:00.000Z')
  })
})

test.group('Daily reminder: did the person log anything today', () => {
  const evening = at('2026-10-16T20:00:00+10:00')

  test('test_nothing_created_means_nothing_logged_today', ({ assert }) => {
    assert.isFalse(loggedSomethingToday([], evening, BRISBANE))
  })

  test('test_an_entry_created_this_local_day_counts_whatever_its_date', ({ assert }) => {
    // Created at 08:15 Brisbane (22:15 UTC the day before).
    assert.isTrue(loggedSomethingToday([at('2026-10-15T22:15:00Z')], evening, BRISBANE))
  })

  test('test_an_entry_created_yesterday_does_not_count', ({ assert }) => {
    // 23:50 on the 15th in Brisbane.
    assert.isFalse(loggedSomethingToday([at('2026-10-15T13:50:00Z')], evening, BRISBANE))
  })

  test('test_the_day_boundary_is_the_household_time_zone_not_utc', ({ assert }) => {
    // 14:30 UTC on the 15th = 00:30 on the 16th in Brisbane, but still the
    // 15th in UTC.
    const justAfterMidnight = at('2026-10-15T14:30:00Z')

    assert.isTrue(loggedSomethingToday([justAfterMidnight], evening, BRISBANE))
    assert.isFalse(
      loggedSomethingToday([justAfterMidnight], at('2026-10-16T20:00:00-06:00'), MEXICO_CITY)
    )
  })

  test('test_one_entry_today_among_older_ones_is_enough', ({ assert }) => {
    const created = [at('2026-10-01T09:00:00+10:00'), at('2026-10-16T12:00:00+10:00')]

    assert.isTrue(loggedSomethingToday(created, evening, BRISBANE))
  })
})
