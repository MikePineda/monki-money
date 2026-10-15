import {
  addMonths,
  compareYearMonth,
  isYearMonth,
  label,
  monthOf,
  monthRange,
  todayIn,
  toYearMonth,
  yearOf,
  type YearMonth,
} from './month'

const ym = (value: string): YearMonth => {
  if (!isYearMonth(value)) {
    throw new Error(`bad fixture ${value}`)
  }
  return value
}

describe('YearMonth', () => {
  it('test_accepts_only_yyyy_mm', () => {
    expect(isYearMonth('2026-10')).toBe(true)
    expect(isYearMonth('2026-1')).toBe(false)
    expect(isYearMonth('2026-13')).toBe(false)
    expect(isYearMonth('2026-00')).toBe(false)
    expect(isYearMonth('2026-10-01')).toBe(false)
  })

  it('test_builds_from_year_and_month_number', () => {
    expect(toYearMonth(2026, 3)).toBe('2026-03')
  })

  it('test_takes_the_month_of_a_transaction_date', () => {
    expect(monthOf('2026-10-15')).toBe('2026-10')
  })

  it('test_reads_the_year', () => {
    expect(yearOf(ym('2025-12'))).toBe(2025)
  })
})

describe('addMonths', () => {
  it('test_moves_forward_and_back_within_a_year', () => {
    expect(addMonths(ym('2026-10'), 1)).toBe('2026-11')
    expect(addMonths(ym('2026-10'), -3)).toBe('2026-07')
  })

  it('test_crosses_the_year_boundary', () => {
    expect(addMonths(ym('2026-12'), 1)).toBe('2027-01')
    expect(addMonths(ym('2026-01'), -1)).toBe('2025-12')
    expect(addMonths(ym('2026-10'), -22)).toBe('2024-12')
  })
})

describe('compareYearMonth and monthRange', () => {
  it('test_orders_months_chronologically', () => {
    expect(compareYearMonth(ym('2025-12'), ym('2026-01'))).toBeLessThan(0)
    expect(compareYearMonth(ym('2026-01'), ym('2026-01'))).toBe(0)
    expect(compareYearMonth(ym('2026-02'), ym('2026-01'))).toBeGreaterThan(0)
  })

  it('test_lists_consecutive_months_inclusive', () => {
    expect(monthRange(ym('2025-11'), ym('2026-02'))).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ])
  })
})

describe('label', () => {
  it('test_short_month_names_per_locale', () => {
    expect(label(ym('2026-10'), 'es-MX')).toBe('oct')
    expect(label(ym('2026-10'), 'en-AU')).toBe('Oct')
  })

  it('test_adds_the_year_when_asked', () => {
    expect(label(ym('2025-12'), 'es-MX', { withYear: true })).toBe('dic 2025')
    expect(label(ym('2025-12'), 'en-AU', { withYear: true })).toBe('Dec 2025')
  })

  it('test_long_month_names', () => {
    expect(label(ym('2026-10'), 'es-MX', { long: true })).toBe('octubre')
    expect(label(ym('2026-10'), 'en-AU', { long: true })).toBe('October')
  })
})

describe('todayIn', () => {
  it('test_returns_the_calendar_date_in_the_household_time_zone', () => {
    const instant = new Date('2026-10-15T15:00:00Z')

    expect(todayIn('Australia/Brisbane', instant)).toBe('2026-10-16')
    expect(todayIn('America/Mexico_City', instant)).toBe('2026-10-15')
  })

  it('test_handles_the_new_year_in_brisbane', () => {
    expect(todayIn('Australia/Brisbane', new Date('2026-12-31T14:30:00Z'))).toBe('2027-01-01')
  })
})
