import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import { isAnnounceable, recipientsOf } from '#domain/push/summary_announcement'

const BRISBANE = 'Australia/Brisbane'

function at(iso: string) {
  return DateTime.fromISO(iso, { setZone: true })
}

test.group('Summary announcement: which summaries', () => {
  test('test_a_scheduled_summary_is_always_announced', ({ assert }) => {
    const summary = {
      month: '2026-09',
      generatedAt: at('2026-10-01T08:00:00+10:00'),
      generatedByUserId: null,
    }

    assert.isTrue(isAnnounceable(summary, BRISBANE))
  })

  test('test_a_summary_generated_by_hand_for_the_month_that_just_ended_is_announced', ({
    assert,
  }) => {
    // Tapped at 07:10 on the 1st, before the scheduled run at 08:00.
    const summary = {
      month: '2026-09',
      generatedAt: at('2026-10-01T07:10:00+10:00'),
      generatedByUserId: 7,
    }

    assert.isTrue(isAnnounceable(summary, BRISBANE))
  })

  test('test_a_summary_generated_by_hand_before_its_month_ended_is_not_announced', ({ assert }) => {
    // 23:30 on 30 September in Brisbane: the month is not over yet.
    const summary = {
      month: '2026-09',
      generatedAt: at('2026-09-30T13:30:00Z'),
      generatedByUserId: 7,
    }

    assert.isFalse(isAnnounceable(summary, BRISBANE))
  })

  test('test_a_summary_generated_by_hand_for_an_older_month_is_not_announced', ({ assert }) => {
    const summary = {
      month: '2026-08',
      generatedAt: at('2026-10-01T09:00:00+10:00'),
      generatedByUserId: 7,
    }

    assert.isFalse(isAnnounceable(summary, BRISBANE))
  })

  test('test_the_month_boundary_is_the_household_time_zone', ({ assert }) => {
    // 15:00 UTC on 30 September is 01:00 on 1 October in Brisbane.
    const summary = {
      month: '2026-09',
      generatedAt: at('2026-09-30T15:00:00Z'),
      generatedByUserId: 7,
    }

    assert.isTrue(isAnnounceable(summary, BRISBANE))
    assert.isFalse(isAnnounceable(summary, 'America/Mexico_City'))
  })
})

test.group('Summary announcement: who is told', () => {
  test('test_everyone_is_told_about_a_scheduled_summary', ({ assert }) => {
    assert.deepEqual(recipientsOf([3, 7], null), [3, 7])
  })

  test('test_the_person_who_generated_it_by_hand_is_not_told', ({ assert }) => {
    assert.deepEqual(recipientsOf([3, 7, 9], 7), [3, 9])
  })
})
