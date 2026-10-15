import { formatDay, formatDayMonth, formatWeekday } from './dates'

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

describe('calendar date labels', () => {
  it('test_weekday_day_and_month_in_both_locales', () => {
    expect(formatWeekday('2026-10-15', 'en-AU')).toBe('Thu 15 Oct')
    expect(formatWeekday('2026-10-15', 'es-MX')).toBe('jue 15 oct')
  })

  it('test_day_and_month_without_the_year', () => {
    expect(formatDayMonth('2026-10-05', 'en-AU')).toBe('5 Oct')
    expect(formatDayMonth('2026-10-05', 'es-MX')).toBe('5 oct')
  })
})
