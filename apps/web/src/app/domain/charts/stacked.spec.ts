import { STACK_GAP, layoutStacked100 } from './stacked'

const WHO_PAID = [
  { id: 'you', valueCents: 151_040 },
  { id: 'partner', valueCents: 101_820 },
  { id: 'shared', valueCents: 75_600 },
]

describe('layoutStacked100', () => {
  it('test_segments_and_their_two_pixel_gaps_fill_the_bar_exactly', () => {
    const { segments } = layoutStacked100(WHO_PAID, 300)
    const widths = segments.reduce((sum, segment) => sum + segment.width, 0)
    const last = segments.at(-1)

    expect(STACK_GAP).toBe(2)
    expect(widths + STACK_GAP * (segments.length - 1)).toBeCloseTo(300)
    expect((last?.x ?? 0) + (last?.width ?? 0)).toBeCloseTo(300)
    expect(segments[1]?.x).toBeCloseTo((segments[0]?.width ?? 0) + STACK_GAP)
  })

  it('test_segment_widths_are_proportional_to_value', () => {
    const { segments } = layoutStacked100(WHO_PAID, 300)
    const available = 300 - 2 * STACK_GAP

    expect(segments[0]?.width).toBeCloseTo((available * 151_040) / 328_460)
  })

  it('test_percentages_sum_to_one_hundred_and_shares_to_one', () => {
    const { parts, totalCents } = layoutStacked100(WHO_PAID, 300)

    expect(totalCents).toBe(328_460)
    expect(parts.map((part) => part.percent)).toEqual([46, 31, 23])
    expect(parts.reduce((sum, part) => sum + part.share, 0)).toBeCloseTo(1)
  })

  it('test_only_the_first_segment_starts_at_the_baseline_and_only_the_last_has_the_data_end', () => {
    const { segments } = layoutStacked100(WHO_PAID, 300)

    expect(segments.map((segment) => [segment.first, segment.last])).toEqual([
      [true, false],
      [false, false],
      [false, true],
    ])
  })

  it('test_zero_and_negative_parts_keep_a_legend_entry_but_draw_no_segment', () => {
    const { segments, parts } = layoutStacked100(
      [
        { id: 'you', valueCents: 1_000 },
        { id: 'partner', valueCents: 0 },
        { id: 'shared', valueCents: -500 },
      ],
      100
    )

    expect(segments.map((segment) => segment.id)).toEqual(['you'])
    expect(segments[0]?.width).toBe(100)
    expect(parts.map((part) => part.percent)).toEqual([100, 0, 0])
  })

  it('test_nothing_spent_is_an_empty_bar', () => {
    const { segments, totalCents } = layoutStacked100([{ id: 'you', valueCents: 0 }], 100)

    expect(segments).toEqual([])
    expect(totalCents).toBe(0)
  })
})
