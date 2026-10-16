import { test } from '@japa/runner'
import {
  addCadence,
  dueDatesBetween,
  nextDueOnOrAfter,
  stepsBetween,
} from '#domain/recurring/cadence'

test.group('Recurring: cadence calendar', () => {
  test('test_monthly_steps_keep_the_day_and_clamp_short_months', ({ assert }) => {
    assert.equal(addCadence('2026-01-31', 'monthly'), '2026-02-28')
    assert.equal(addCadence('2026-01-31', 'monthly', 2), '2026-03-31')
    assert.equal(addCadence('2024-01-31', 'monthly'), '2024-02-29')
    assert.equal(addCadence('2026-11-15', 'quarterly'), '2027-02-15')
    assert.equal(addCadence('2026-03-10', 'yearly'), '2027-03-10')
    assert.equal(addCadence('2026-10-01', 'weekly', 3), '2026-10-22')
    assert.equal(addCadence('2026-10-01', 'fortnightly', -1), '2026-09-17')
  })

  test('test_gaps_count_whole_steps_within_their_tolerance', ({ assert }) => {
    // Weekly 6-8 days, fortnightly 13-15 days (the spec's ranges).
    assert.equal(stepsBetween('2026-10-01', '2026-10-07', 'weekly'), 1)
    assert.equal(stepsBetween('2026-10-01', '2026-10-09', 'weekly'), 1)
    assert.isNull(stepsBetween('2026-10-01', '2026-10-10', 'weekly'))
    assert.equal(stepsBetween('2026-10-01', '2026-10-15', 'weekly'), 2)
    assert.equal(stepsBetween('2026-10-01', '2026-10-14', 'fortnightly'), 1)
    assert.isNull(stepsBetween('2026-10-01', '2026-10-18', 'fortnightly'))
    // Monthly: the same day of the next month, give or take a weekend.
    assert.equal(stepsBetween('2026-01-31', '2026-02-28', 'monthly'), 1)
    assert.equal(stepsBetween('2026-08-15', '2026-09-17', 'monthly'), 1)
    assert.isNull(stepsBetween('2026-08-15', '2026-09-25', 'monthly'))
    assert.equal(stepsBetween('2026-07-15', '2026-09-15', 'monthly'), 2)
    // One skipped step is a gap in the pattern; two are not.
    assert.isNull(stepsBetween('2026-06-15', '2026-09-15', 'monthly'))
    assert.equal(stepsBetween('2026-01-05', '2026-04-06', 'quarterly'), 1)
    assert.isNull(stepsBetween('2026-10-01', '2026-10-01', 'weekly'))
  })

  test('test_next_due_date_is_the_first_step_on_or_after_today', ({ assert }) => {
    assert.equal(nextDueOnOrAfter('2026-10-07', 'weekly', '2026-10-10'), '2026-10-14')
    assert.equal(nextDueOnOrAfter('2026-10-07', 'weekly', '2026-10-14'), '2026-10-14')
    // Steps behind (an import still to come): rolled forward, never in the past.
    assert.equal(nextDueOnOrAfter('2026-09-23', 'weekly', '2026-10-16'), '2026-10-21')
    // Counted from the last payment, so a 31st never drifts to the 28th.
    assert.equal(nextDueOnOrAfter('2026-01-31', 'monthly', '2026-03-01'), '2026-03-31')
    // A payment made today is due again one step later.
    assert.equal(nextDueOnOrAfter('2026-10-16', 'monthly', '2026-10-16'), '2026-11-16')
  })

  test('test_due_dates_of_a_month_follow_the_anchor_both_ways', ({ assert }) => {
    assert.deepEqual(dueDatesBetween('2026-10-20', 'weekly', '2026-10-01', '2026-10-31'), [
      '2026-10-06',
      '2026-10-13',
      '2026-10-20',
      '2026-10-27',
    ])
    assert.deepEqual(dueDatesBetween('2026-11-03', 'fortnightly', '2026-10-01', '2026-10-31'), [
      '2026-10-06',
      '2026-10-20',
    ])
    assert.deepEqual(dueDatesBetween('2026-01-31', 'monthly', '2026-02-01', '2026-02-28'), [
      '2026-02-28',
    ])
    assert.deepEqual(dueDatesBetween('2026-11-05', 'quarterly', '2026-10-01', '2026-10-31'), [])
    assert.deepEqual(dueDatesBetween('2026-11-05', 'quarterly', '2026-08-01', '2026-08-31'), [
      '2026-08-05',
    ])
    assert.deepEqual(dueDatesBetween('2027-03-10', 'yearly', '2026-03-01', '2026-03-31'), [
      '2026-03-10',
    ])
  })
})
