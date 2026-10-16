import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import { CLASSIFY_CLAIM_MINUTES, isClassifyRunning } from '#domain/importing/classify_run'

const now = DateTime.fromISO('2026-10-15T09:00:00.000Z')

test.group('Importing / classify run', () => {
  test('test_a_batch_without_a_claim_is_not_classifying', ({ assert }) => {
    assert.isFalse(isClassifyRunning(null, now))
  })

  test('test_a_fresh_claim_means_a_run_is_going_on', ({ assert }) => {
    assert.isTrue(isClassifyRunning(now, now))
    assert.isTrue(isClassifyRunning(now.minus({ minutes: CLASSIFY_CLAIM_MINUTES - 1 }), now))
  })

  test('test_a_claim_past_the_takeover_window_belongs_to_a_dead_run', ({ assert }) => {
    assert.isFalse(isClassifyRunning(now.minus({ minutes: CLASSIFY_CLAIM_MINUTES }), now))
    assert.isFalse(isClassifyRunning(now.minus({ hours: 2 }), now))
  })
})
