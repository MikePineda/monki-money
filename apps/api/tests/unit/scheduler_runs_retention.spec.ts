import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import { RUNS_RETENTION_MONTHS, retentionCutoff, retentionDay } from '#services/scheduler/retention'

const at = (iso: string) => DateTime.fromISO(iso, { setZone: true })

test.group('Scheduler runs retention', () => {
  test('test_runs_are_kept_for_thirteen_months', ({ assert }) => {
    assert.equal(RUNS_RETENTION_MONTHS, 13)
  })

  test('test_the_cut_off_is_thirteen_months_before_now_in_utc', ({ assert }) => {
    const cutoff = retentionCutoff(at('2026-10-25T08:30:00+10:00'))

    assert.equal(cutoff.toISO(), '2025-09-24T22:30:00.000Z')
  })

  test('test_the_cut_off_of_a_month_end_falls_on_the_last_day_of_the_shorter_month', ({
    assert,
  }) => {
    const cutoff = retentionCutoff(at('2026-03-31T12:00:00Z'))

    assert.equal(cutoff.toISO(), '2025-02-28T12:00:00.000Z')
  })

  test('test_last_years_same_month_is_still_kept', ({ assert }) => {
    // A monthly run for September 2025 started on 1 October 2025.
    const septemberRun = at('2025-10-01T08:15:00+10:00')

    assert.isTrue(septemberRun > retentionCutoff(at('2026-10-25T08:30:00+10:00')))
    assert.isFalse(septemberRun > retentionCutoff(at('2026-11-02T08:30:00+10:00')))
  })

  test('test_the_prune_is_claimed_once_per_utc_day', ({ assert }) => {
    assert.equal(retentionDay(at('2026-10-25T08:30:00+10:00')), '2026-10-24')
    assert.equal(retentionDay(at('2026-10-25T10:30:00+10:00')), '2026-10-25')
  })
})
