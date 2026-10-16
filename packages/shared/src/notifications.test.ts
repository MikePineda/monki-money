import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  LATEST_REMINDER_TIME,
  isReminderTime,
  reminderMinutes,
} from './notifications.ts'

test('the summary is on and the daily reminder off at 20:00 by default', () => {
  assert.deepEqual(DEFAULT_NOTIFICATION_SETTINGS, {
    summaryReady: true,
    dailyReminder: false,
    reminderTime: '20:00',
  })
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
