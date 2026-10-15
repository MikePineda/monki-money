import { compactMoney, formatPercent, percentShares } from './format'

const MINUS = '−'

describe('compactMoney', () => {
  it('test_axis_ticks_compact_from_one_thousand_dollars', () => {
    expect(compactMoney(0, 'en-AU')).toBe('$0')
    expect(compactMoney(50000, 'en-AU')).toBe('$500')
    expect(compactMoney(200000, 'en-AU')).toBe('$2k')
    expect(compactMoney(250000, 'en-AU')).toBe('$2.5k')
    expect(compactMoney(1200000, 'en-AU')).toBe('$12k')
    expect(compactMoney(150000000, 'en-AU')).toBe('$1.5M')
  })

  it('test_spanish_uses_the_same_compact_shape', () => {
    expect(compactMoney(400000, 'es-MX')).toBe('$4k')
    expect(compactMoney(250000, 'es-MX')).toBe('$2.5k')
  })

  it('test_negative_ticks_use_the_true_minus_sign', () => {
    expect(compactMoney(-200000, 'en-AU')).toBe(`${MINUS}$2k`)
    expect(compactMoney(-50000, 'en-AU')).toBe(`${MINUS}$500`)
  })

  it('test_values_under_a_thousand_round_to_whole_dollars', () => {
    expect(compactMoney(149, 'en-AU')).toBe('$1')
    expect(compactMoney(99_949, 'en-AU')).toBe('$999')
  })

  it('test_rounding_up_to_a_thousand_switches_to_the_compact_form', () => {
    expect(compactMoney(99_990, 'en-AU')).toBe('$1k')
  })
})

describe('percentShares', () => {
  it('test_rounded_percentages_always_sum_to_one_hundred', () => {
    const shares = percentShares([151040, 101820, 75600])

    expect(shares).toEqual([46, 31, 23])
    expect(shares.reduce((a, b) => a + b, 0)).toBe(100)
  })

  it('test_largest_remainder_breaks_three_way_thirds_in_order', () => {
    expect(percentShares([1, 1, 1])).toEqual([34, 33, 33])
  })

  it('test_negative_and_zero_values_get_zero_percent', () => {
    expect(percentShares([300, 0, -100, 100])).toEqual([75, 0, 0, 25])
  })

  it('test_nothing_to_share_is_all_zero', () => {
    expect(percentShares([0, 0])).toEqual([0, 0])
    expect(percentShares([])).toEqual([])
  })
})

describe('formatPercent', () => {
  it('test_whole_percent_with_the_locale_sign', () => {
    expect(formatPercent(46, 'en-AU')).toBe('46%')
    expect(formatPercent(0, 'es-MX')).toMatch(/^0\s?%$/)
  })
})
