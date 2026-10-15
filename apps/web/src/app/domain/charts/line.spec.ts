import { LINE_MARGIN, layoutLine, nearestIndex, placeEndLabel, xLabelIndices } from './line'

const SIX_MONTHS = [312_040, 298_550, 351_260, 287_400, 357_120, 328_450]

describe('layoutLine', () => {
  const layout = layoutLine([{ id: 'spend', values: SIX_MONTHS }], { width: 320, height: 180 })

  it('test_points_spread_across_the_plot_inside_the_margins', () => {
    expect(layout.plot).toEqual({
      left: LINE_MARGIN.left,
      right: 320 - LINE_MARGIN.right,
      top: LINE_MARGIN.top,
      bottom: 180 - LINE_MARGIN.bottom,
    })
    expect(layout.xs[0]).toBe(layout.plot.left)
    expect(layout.xs.at(-1)).toBe(layout.plot.right)
    expect(layout.xs).toHaveLength(6)
  })

  it('test_one_value_axis_from_zero_with_clean_money_ticks', () => {
    expect(layout.ticks.map((tick) => tick.value)).toEqual([0, 200_000, 400_000])
    expect(layout.ticks[0]?.y).toBe(layout.plot.bottom)
    expect(layout.ticks.at(-1)?.y).toBe(layout.plot.top)
    expect(layout.zeroY).toBe(layout.plot.bottom)
  })

  it('test_each_value_becomes_a_marker_at_its_scaled_height', () => {
    const points = layout.series[0]?.points ?? []

    expect(points).toHaveLength(6)
    expect(points[1]?.x).toBe(layout.xs[1])
    expect(points[0]?.y).toBeCloseTo(layout.y(312_040))
    expect(points[0]?.y).toBeLessThan(layout.plot.bottom)
    expect(points[0]?.y).toBeGreaterThan(layout.plot.top)
  })

  it('test_the_line_is_a_smooth_monotone_path_through_every_point', () => {
    const path = layout.series[0]?.path ?? ''

    expect(path.startsWith(`M${layout.xs[0]},`)).toBe(true)
    expect(path).toContain('C')
    expect(path.match(/M/g)).toHaveLength(1)
  })

  it('test_missing_values_break_the_line_and_skip_the_marker', () => {
    const gappy = layoutLine([{ id: 'spend', values: [100, null, 300, 400] }], {
      width: 320,
      height: 180,
    })
    const series = gappy.series[0]

    expect(series?.points.map((point) => point.index)).toEqual([0, 2, 3])
    expect(series?.path.match(/M/g)).toHaveLength(2)
  })

  it('test_every_series_shares_one_y_scale', () => {
    const two = layoutLine(
      [
        { id: 'a', values: [100_000, 200_000] },
        { id: 'b', values: [500_000, 50_000] },
      ],
      { width: 320, height: 180 }
    )

    expect(two.ticks.at(-1)?.value).toBe(600_000)
    expect(two.series[1]?.points[0]?.y).toBeCloseTo(two.y(500_000))
  })

  it('test_extra_values_such_as_a_threshold_widen_the_domain', () => {
    const withGoal = layoutLine([{ id: 'a', values: [100_000] }], {
      width: 320,
      height: 180,
      include: [1_000_000],
    })

    expect(withGoal.ticks.at(-1)?.value).toBeGreaterThanOrEqual(1_000_000)
  })

  it('test_hit_bands_tile_the_plot_and_are_at_least_24px_wide', () => {
    const { bands } = layout

    expect(bands).toHaveLength(6)
    for (const [index, band] of bands.entries()) {
      expect(band.width).toBeGreaterThanOrEqual(24)
      const next = bands[index + 1]
      if (next) {
        expect(band.x + band.width).toBeCloseTo(next.x)
      }
    }
    expect(bands[2]?.x).toBeLessThan(layout.xs[2] ?? 0)
    expect((bands[2]?.x ?? 0) + (bands[2]?.width ?? 0)).toBeGreaterThan(layout.xs[2] ?? 0)
  })

  it('test_a_single_month_is_a_lone_centred_marker', () => {
    const one = layoutLine([{ id: 'a', values: [120_000] }], { width: 320, height: 180 })

    expect(one.xs).toEqual([(one.plot.left + one.plot.right) / 2])
    expect(one.series[0]?.points).toHaveLength(1)
    expect(one.bands[0]?.width).toBeGreaterThanOrEqual(24)
  })

  it('test_no_data_still_lays_out_an_empty_axis', () => {
    const empty = layoutLine([], { width: 320, height: 180 })

    expect(empty.xs).toEqual([])
    expect(empty.series).toEqual([])
    expect(empty.ticks.length).toBeGreaterThan(1)
  })
})

describe('nearestIndex', () => {
  const xs = [40, 120, 200]

  it('test_snaps_the_pointer_to_the_nearest_x', () => {
    expect(nearestIndex(xs, 0)).toBe(0)
    expect(nearestIndex(xs, 79)).toBe(0)
    expect(nearestIndex(xs, 81)).toBe(1)
    expect(nearestIndex(xs, 165)).toBe(2)
    expect(nearestIndex(xs, 1_000)).toBe(2)
  })

  it('test_a_tie_goes_to_the_earlier_point', () => {
    expect(nearestIndex(xs, 80)).toBe(0)
  })

  it('test_no_points_means_no_index', () => {
    expect(nearestIndex([], 50)).toBe(-1)
  })
})

describe('xLabelIndices', () => {
  it('test_labels_every_month_when_they_fit', () => {
    expect(xLabelIndices(6, 264)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('test_thins_labels_but_always_keeps_the_latest_month', () => {
    expect(xLabelIndices(24, 280)).toEqual([3, 7, 11, 15, 19, 23])
  })

  it('test_nothing_to_label_without_data', () => {
    expect(xLabelIndices(0, 280)).toEqual([])
  })
})

describe('placeEndLabel', () => {
  it('test_the_end_label_sits_above_its_marker', () => {
    expect(placeEndLabel(80)).toEqual({ y: 68, side: 'above' })
  })

  it('test_the_end_label_drops_below_a_marker_at_the_top_edge', () => {
    expect(placeEndLabel(14)).toEqual({ y: 36, side: 'below' })
  })
})
