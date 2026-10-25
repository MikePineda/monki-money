import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  EVERY_WEEKDAY,
  LATEST_REMINDER_TIME,
  isReminderTime,
  isReminderWeekdays,
  reminderMinutes,
  sortedWeekdays,
} from './notifications.ts'

test('the summary is on and the daily reminder off at 20:00 every day by default', () => {
  assert.deepEqual(DEFAULT_NOTIFICATION_SETTINGS, {
    summaryReady: true,
    dailyReminder: false,
    reminderTime: '20:00',
    reminderWeekdays: [1, 2, 3, 4, 5, 6, 7],
  })
  assert.deepEqual(EVERY_WEEKDAY, [1, 2, 3, 4, 5, 6, 7])
})

test('reminder weekdays are one to seven distinct ISO weekdays, Monday 1 to Sunday 7', () => {
  for (const days of [[1], [7], [1, 2, 3, 4, 5], [6, 7], [7, 1], [1, 2, 3, 4, 5, 6, 7]]) {
    assert.equal(isReminderWeekdays(days), true, JSON.stringify(days))
  }
  for (const days of [[], [0], [8], [1, 1], [1.5], ['1'], null, undefined, '1,2', 3]) {
    assert.equal(isReminderWeekdays(days), false, JSON.stringify(days))
  }
})

test('reminder weekdays are kept Monday first', () => {
  assert.deepEqual(sortedWeekdays([7, 3, 1]), [1, 3, 7])
})

test('a reminder time is a 24-hour HH:mm up to 23:30', () => {
  for (const time of ['00:00', '07:05', '19:30', '23:30']) {
    assert.equal(isReminderTime(time), true, time)
  }
  // After 23:30 the last 15-minute tick before midnight could miss it.
  for (const time of [
    '23:31',
    '23:45',
    '23:59',
    '24:00',
    '7:05',
    '19:60',
    '19:30:00',
    '',
    ' 19:30',
    19,
  ]) {
    assert.equal(isReminderTime(time), false, String(time))
  }
})

test('the latest reminder time leaves two ticks before midnight', () => {
  assert.equal(LATEST_REMINDER_TIME, '23:30')
})

test('a reminder time counts its minutes from midnight', () => {
  assert.equal(reminderMinutes('00:00'), 0)
  assert.equal(reminderMinutes('20:00'), 1200)
  assert.equal(reminderMinutes('23:30'), 1410)
  assert.throws(() => reminderMinutes('23:45'), RangeError)
})
