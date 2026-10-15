import { DateTime } from 'luxon'
import { test } from '@japa/runner'
import {
  addMonths,
  currentMonth,
  isMonth,
  monthOf,
  monthRange,
  monthsBetween,
  previousMonths,
  todayIn,
} from '#domain/calendar/month'

test.group('Calendar: month', () => {
  test('test_month_range_covers_the_calendar_month', ({ assert }) => {
    assert.deepEqual(monthRange('2026-10'), { from: '2026-10-01', to: '2026-10-31' })
    assert.deepEqual(monthRange('2026-09'), { from: '2026-09-01', to: '2026-09-30' })
    assert.deepEqual(monthRange('2026-02'), { from: '2026-02-01', to: '2026-02-28' })
    assert.deepEqual(monthRange('2028-02'), { from: '2028-02-01', to: '2028-02-29' })
    assert.throws(() => monthRange('2026-13'))
  })

  test('test_month_boundary_uses_calendar_date_not_timestamp', ({ assert }) => {
    // A purchase on the last evening of the month in Brisbane is still that
    // month, even though the instant is the next day in some other zone.
    assert.equal(monthOf('2026-09-30'), '2026-09')
    assert.equal(monthOf('2026-10-01'), '2026-10')
    assert.equal(monthOf('2026-12-31'), '2026-12')
  })

  test('test_current_month_is_computed_in_household_timezone', ({ assert }) => {
    // 2026-09-30 15:30 UTC is already 2026-10-01 01:30 in Brisbane (UTC+10).
    const now = DateTime.fromISO('2026-09-30T15:30:00Z')
    assert.equal(currentMonth(now, 'Australia/Brisbane'), '2026-10')
    assert.equal(currentMonth(now, 'UTC'), '2026-09')
    assert.equal(todayIn(now, 'Australia/Brisbane'), '2026-10-01')
    assert.equal(todayIn(now, 'America/Mexico_City'), '2026-09-30')
  })

  test('test_previous_months_walks_back_across_years', ({ assert }) => {
    assert.deepEqual(previousMonths('2026-02', 4), ['2025-11', '2025-12', '2026-01', '2026-02'])
    assert.deepEqual(previousMonths('2026-10', 1), ['2026-10'])
    assert.equal(addMonths('2026-01', -1), '2025-12')
    assert.equal(addMonths('2026-12', 1), '2027-01')
    assert.equal(addMonths('2026-05', -17), '2024-12')
  })

  test('test_months_between_counts_calendar_months_across_years', ({ assert }) => {
    assert.equal(monthsBetween('2026-10', '2026-10'), 0)
    assert.equal(monthsBetween('2026-10', '2027-06'), 8)
    assert.equal(monthsBetween('2026-10', '2026-07'), -3)
    assert.equal(monthsBetween('2025-12', '2026-01'), 1)
  })

  test('test_is_month_accepts_only_yyyy_mm', ({ assert }) => {
    assert.isTrue(isMonth('2026-10'))
    for (const value of ['2026-1', '2026-00', '2026-13', '26-10', '2026-10-01', '']) {
      assert.isFalse(isMonth(value), value)
    }
  })
})
