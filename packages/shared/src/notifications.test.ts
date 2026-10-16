import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_NOTIFICATION_SETTINGS, isReminderTime, reminderMinutes } from './notifications.ts'

test('the summary is on and the daily reminder off at 20:00 by default', () => {
  assert.deepEqual(DEFAULT_NOTIFICATION_SETTINGS, {
    summaryReady: true,
    dailyReminder: false,
    reminderTime: '20:00',
  })
})

test('a reminder time is a 24-hour HH:mm', () => {
  for (const time of ['00:00', '07:05', '19:30', '23:59']) {
    assert.equal(isReminderTime(time), true, time)
  }
  for (const time of ['24:00', '7:05', '19:60', '19:30:00', '', ' 19:30', 19]) {
    assert.equal(isReminderTime(time), false, String(time))
  }
})

test('a reminder time counts its minutes from midnight', () => {
  assert.equal(reminderMinutes('00:00'), 0)
  assert.equal(reminderMinutes('20:00'), 1200)
  assert.equal(reminderMinutes('23:59'), 1439)
  assert.throws(() => reminderMinutes('24:00'), RangeError)
})
