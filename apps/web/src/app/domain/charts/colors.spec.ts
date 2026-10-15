import { SERIES_SLOTS, chartColorVar, seriesColor } from './colors'

describe('chart colours', () => {
  it('test_every_colour_is_a_css_token_reference', () => {
    expect(chartColorVar('neutral')).toBe('var(--mark-neutral)')
    expect(chartColorVar('muted')).toBe('var(--mark-muted)')
    expect(chartColorVar('person-a')).toBe('var(--person-a)')
    expect(chartColorVar('person-b')).toBe('var(--person-b)')
    expect(chartColorVar('series-3')).toBe('var(--series-3)')
  })

  it('test_series_colours_are_assigned_in_fixed_order', () => {
    expect([0, 1, 2, 7].map((index) => seriesColor(index))).toEqual([
      'series-1',
      'series-2',
      'series-3',
      'series-8',
    ])
  })

  it('test_a_ninth_series_is_never_a_cycled_hue', () => {
    expect(SERIES_SLOTS).toBe(8)
    expect(() => seriesColor(8)).toThrow(RangeError)
    expect(() => seriesColor(-1)).toThrow(RangeError)
  })
})
