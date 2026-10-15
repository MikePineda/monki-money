import { bandScale, linearScale, niceTicks, pointPositions } from './scales'

describe('niceTicks', () => {
  it('test_money_ticks_land_on_clean_steps_like_the_month_trend', () => {
    expect(niceTicks(0, 551_000).values).toEqual([0, 200_000, 400_000, 600_000])
    expect(niceTicks(0, 380_000).values).toEqual([0, 200_000, 400_000])
  })

  it('test_a_maximum_on_a_step_is_not_padded_with_an_extra_tick', () => {
    const ticks = niceTicks(0, 400_000)

    expect(ticks.values).toEqual([0, 200_000, 400_000])
    expect(ticks.max).toBe(400_000)
  })

  it('test_never_more_intervals_than_asked', () => {
    for (const max of [1, 99, 4_250, 99_999, 1_234_567, 98_765_432]) {
      const ticks = niceTicks(0, max, 3)
      expect(ticks.values.length - 1).toBeLessThanOrEqual(3)
      expect(ticks.max).toBeGreaterThanOrEqual(max)
    }
  })

  it('test_steps_are_one_two_or_five_times_a_power_of_ten_and_at_least_a_dollar', () => {
    expect(niceTicks(0, 4_250).step).toBe(2_000)
    expect(niceTicks(0, 120).step).toBe(100)
    expect(niceTicks(0, 1).step).toBe(100)
  })

  it('test_negative_values_extend_the_domain_below_zero', () => {
    const ticks = niceTicks(-120_000, 300_000)

    expect(ticks.values).toEqual([-200_000, 0, 200_000, 400_000])
  })

  it('test_an_all_zero_series_still_gets_a_usable_domain', () => {
    const ticks = niceTicks(0, 0)

    expect(ticks.min).toBe(0)
    expect(ticks.max).toBeGreaterThan(0)
    expect(ticks.values[0]).toBe(0)
  })

  it('test_non_finite_bounds_fall_back_to_zero_instead_of_looping', () => {
    expect(niceTicks(Number.NEGATIVE_INFINITY, Number.NaN).values).toEqual([0, 100])
  })

  it('test_swapped_bounds_are_normalised', () => {
    expect(niceTicks(380_000, 0).values).toEqual([0, 200_000, 400_000])
  })
})

describe('linearScale', () => {
  it('test_maps_the_domain_onto_an_inverted_pixel_range', () => {
    const y = linearScale([0, 400_000], [140, 0])

    expect(y(0)).toBe(140)
    expect(y(200_000)).toBe(70)
    expect(y(400_000)).toBe(0)
  })

  it('test_a_degenerate_domain_maps_to_the_middle_of_the_range', () => {
    expect(linearScale([5, 5], [100, 0])(5)).toBe(50)
  })
})

describe('bandScale', () => {
  it('test_splits_the_range_into_equal_bands', () => {
    const band = bandScale(['a', 'b', 'c', 'd'], [0, 400])

    expect(band.bandwidth).toBe(100)
    expect(band.position('c')).toBe(200)
  })

  it('test_inner_padding_leaves_air_between_bands', () => {
    // A 10px gap in a 110px step.
    const band = bandScale(['a', 'b'], [0, 210], { paddingInner: 1 / 11 })

    expect(band.bandwidth).toBeCloseTo(100)
    expect(band.position('b')).toBeCloseTo(110)
  })

  it('test_an_unknown_key_has_no_position', () => {
    expect(bandScale(['a'], [0, 10]).position('z')).toBeUndefined()
    expect(bandScale([], [0, 10]).position('a')).toBeUndefined()
  })
})

describe('pointPositions', () => {
  it('test_spreads_points_from_edge_to_edge', () => {
    expect(pointPositions(5, [40, 360])).toEqual([40, 120, 200, 280, 360])
  })

  it('test_a_single_point_sits_in_the_middle', () => {
    expect(pointPositions(1, [40, 360])).toEqual([200])
  })

  it('test_no_points_for_no_data', () => {
    expect(pointPositions(0, [40, 360])).toEqual([])
  })
})
