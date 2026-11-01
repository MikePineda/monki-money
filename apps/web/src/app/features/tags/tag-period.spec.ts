import { toYearMonth } from '../../domain/month'
import { TAG_PERIODS, tagPeriodOf, tagRangeOf } from './tag-period'

const OCTOBER = toYearMonth(2026, 10)
const JANUARY = toYearMonth(2026, 1)

describe('tag periods', () => {
  it('test_all_time_reads_every_date', () => {
    expect(tagRangeOf('all', OCTOBER)).toEqual({})
  })

  it('test_the_last_twelve_months_start_eleven_months_before_this_one', () => {
    expect(tagRangeOf('last12', OCTOBER)).toEqual({ from: '2025-11-01' })
    expect(tagRangeOf('last12', JANUARY)).toEqual({ from: '2025-02-01' })
  })

  it('test_this_year_and_last_year_are_whole_calendar_years', () => {
    expect(tagRangeOf('thisYear', OCTOBER)).toEqual({ from: '2026-01-01', to: '2026-12-31' })
    expect(tagRangeOf('lastYear', OCTOBER)).toEqual({ from: '2025-01-01', to: '2025-12-31' })
  })

  it('test_a_period_is_read_from_the_url_and_anything_else_is_all_time', () => {
    for (const period of TAG_PERIODS) {
      expect(tagPeriodOf(period)).toBe(period)
    }
    expect(tagPeriodOf(undefined)).toBe('all')
    expect(tagPeriodOf('')).toBe('all')
    expect(tagPeriodOf('forever')).toBe('all')
  })
})
