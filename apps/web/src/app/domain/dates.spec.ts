import { formatDateRange, formatDay, formatDayMonth, formatWeekdayDate } from './dates'

describe('formatDay', () => {
  it('test_formats_day_first_with_a_short_month_in_both_locales', () => {
    expect(formatDay('2026-11-14T00:00:00.000Z', 'en-AU', 'Australia/Brisbane')).toBe('14 Nov 2026')
    expect(formatDay('2026-11-14T00:00:00.000Z', 'es-MX', 'Australia/Brisbane')).toBe('14 nov 2026')
  })

  it('test_uses_the_household_time_zone_for_the_calendar_day', () => {
    // 13 Nov 23:30 UTC is already 14 Nov in Brisbane (UTC+10).
    expect(formatDay('2026-11-13T23:30:00.000Z', 'en-AU', 'Australia/Brisbane')).toBe('14 Nov 2026')
    expect(formatDay('2026-11-13T23:30:00.000Z', 'en-AU', 'UTC')).toBe('13 Nov 2026')
  })
})

describe('formatWeekdayDate', () => {
  it('test_formats_a_calendar_date_with_its_weekday_day_first', () => {
    expect(formatWeekdayDate('2026-10-14', 'en-AU')).toBe('Wed 14 Oct')
    expect(formatWeekdayDate('2026-10-14', 'es-MX')).toBe('mié 14 oct')
  })

  it('test_adds_the_year_when_asked', () => {
    expect(formatWeekdayDate('2025-12-01', 'en-AU', { withYear: true })).toBe('Mon 1 Dec 2025')
    expect(formatWeekdayDate('2025-12-01', 'es-MX', { withYear: true })).toBe('lun 1 dic 2025')
  })

  it('test_the_device_time_zone_never_shifts_the_day', () => {
    expect(formatWeekdayDate('2026-01-01', 'en-AU')).toBe('Thu 1 Jan')
  })
})

describe('formatDayMonth', () => {
  it('test_day_and_month_without_the_year', () => {
    expect(formatDayMonth('2026-10-05', 'en-AU')).toBe('5 Oct')
    expect(formatDayMonth('2026-10-05', 'es-MX')).toBe('5 oct')
  })
})

describe('formatDateRange', () => {
  it('test_a_range_inside_one_month_names_the_month_once', () => {
    expect(formatDateRange('2026-10-01', '2026-10-27', 'en-AU')).toBe('1–27 Oct')
    expect(formatDateRange('2026-10-01', '2026-10-27', 'es-MX')).toBe('1–27 oct')
  })

  it('test_a_range_across_months_names_both', () => {
    expect(formatDateRange('2026-08-22', '2026-10-05', 'en-AU')).toBe('22 Aug–5 Oct')
  })

  it('test_a_range_across_years_adds_both_years', () => {
    expect(formatDateRange('2025-12-22', '2026-10-05', 'en-AU')).toBe('22 Dec 2025–5 Oct 2026')
  })

  it('test_a_single_day_is_one_date', () => {
    expect(formatDateRange('2026-10-05', '2026-10-05', 'en-AU')).toBe('5 Oct')
  })
})
