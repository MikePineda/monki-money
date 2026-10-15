import { SPARKLINE_INSET, layoutSparkline } from './sparkline'

describe('layoutSparkline', () => {
  it('test_the_line_spans_the_box_inside_the_marker_inset', () => {
    const layout = layoutSparkline([100, 300, 200], { width: 96, height: 24 })

    expect(layout.path.startsWith(`M${SPARKLINE_INSET},`)).toBe(true)
    expect(layout.last?.x).toBe(96 - SPARKLINE_INSET)
  })

  it('test_the_highest_value_touches_the_top_and_the_lowest_the_bottom', () => {
    const layout = layoutSparkline([100, 300, 200], { width: 96, height: 24 })

    expect(layout.points[1]?.y).toBe(SPARKLINE_INSET)
    expect(layout.points[0]?.y).toBe(24 - SPARKLINE_INSET)
  })

  it('test_the_current_period_is_the_last_known_value', () => {
    const layout = layoutSparkline([100, 300, null], { width: 96, height: 24 })

    expect(layout.last?.value).toBe(300)
  })

  it('test_a_flat_series_sits_in_the_middle', () => {
    const layout = layoutSparkline([500, 500, 500], { width: 96, height: 24 })

    expect(layout.points.every((point) => point.y === 12)).toBe(true)
  })

  it('test_no_values_draw_nothing', () => {
    expect(layoutSparkline([], { width: 96, height: 24 })).toEqual({
      path: '',
      points: [],
      last: null,
    })
  })
})
