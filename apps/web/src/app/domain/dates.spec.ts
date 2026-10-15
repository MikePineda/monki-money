import { formatDay } from './dates'

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
