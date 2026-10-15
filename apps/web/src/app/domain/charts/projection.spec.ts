import { addMonths, toYearMonth } from '../month'
import { layoutProjection, type MonthValue } from './projection'

/** Savings balance: $1,000 more every month, month 1 being January 2026. */
function months(from: number, to: number, step = 100_000): MonthValue[] {
  const values: MonthValue[] = []
  for (let month = from; month <= to; month++) {
    values.push({ x: addMonths(toYearMonth(2026, 1), month - 1), valueCents: month * step })
  }
  return values
}

const SIZE = { width: 320, height: 180 }

describe('layoutProjection', () => {
  const history = months(1, 6)
  const projection = months(7, 12)

  it('test_history_and_projection_share_one_month_axis', () => {
    const layout = layoutProjection({ history, projection }, SIZE)

    expect(layout.months).toHaveLength(12)
    expect(layout.months[0]).toBe('2026-01')
    expect(layout.months.at(-1)).toBe('2026-12')
    expect(layout.points.filter((point) => point.projected)).toHaveLength(6)
  })

  it('test_the_projected_segment_continues_from_the_last_actual_month', () => {
    const layout = layoutProjection({ history, projection }, SIZE)
    const lastActual = layout.points.find((point) => point.month === '2026-06')

    // d3-shape writes path coordinates with three decimals.
    const [, x = '', y = ''] = /^M([\d.]+),([\d.]+)/.exec(layout.projectionPath) ?? []

    expect(layout.historyPath.startsWith(`M${layout.line.xs[0]},`)).toBe(true)
    expect(Number(x)).toBeCloseTo(lastActual?.x ?? -1, 2)
    expect(Number(y)).toBeCloseTo(lastActual?.y ?? -1, 2)
  })

  it('test_projected_months_overlapping_history_are_ignored', () => {
    const layout = layoutProjection(
      { history, projection: [{ x: '2026-06', valueCents: 1 }, ...projection] },
      SIZE
    )

    expect(layout.months).toHaveLength(12)
    expect(layout.points.find((point) => point.month === '2026-06')?.valueCents).toBe(600_000)
  })

  it('test_the_threshold_widens_the_axis_and_marks_the_first_month_that_reaches_it', () => {
    const layout = layoutProjection({ history, projection, thresholdCents: 900_000 }, SIZE)

    expect(layout.threshold?.y).toBeCloseTo(layout.line.y(900_000))
    expect(layout.crossing).toMatchObject({ month: '2026-09', projected: true, index: 8 })
    expect(layout.beyondHorizon).toBeNull()
  })

  it('test_a_goal_already_met_in_history_is_marked_as_actual', () => {
    const layout = layoutProjection({ history, projection, thresholdCents: 300_000 }, SIZE)

    expect(layout.crossing).toMatchObject({ month: '2026-03', projected: false })
  })

  it('test_a_falling_balance_crosses_when_it_drops_to_the_threshold', () => {
    const debt = [
      { x: '2026-01', valueCents: 500_000 },
      { x: '2026-02', valueCents: 400_000 },
    ]
    const payoff = [
      { x: '2026-03', valueCents: 250_000 },
      { x: '2026-04', valueCents: 0 },
    ]
    const layout = layoutProjection({ history: debt, projection: payoff, thresholdCents: 0 }, SIZE)

    expect(layout.crossing?.month).toBe('2026-04')
  })

  it('test_projection_beyond_the_horizon_is_trimmed_and_reported', () => {
    const layout = layoutProjection(
      { history, projection: months(7, 18), thresholdCents: 1_500_000, horizon: '2026-12' },
      SIZE
    )

    expect(layout.months.at(-1)).toBe('2026-12')
    expect(layout.crossing).toBeNull()
    expect(layout.beyondHorizon).toEqual({ month: '2027-03' })
  })

  it('test_a_goal_never_reached_has_no_crossing_at_all', () => {
    const layout = layoutProjection({ history, projection, thresholdCents: 5_000_000 }, SIZE)

    expect(layout.crossing).toBeNull()
    expect(layout.beyondHorizon).toBeNull()
  })

  it('test_history_alone_draws_no_projected_segment', () => {
    const layout = layoutProjection({ history, projection: [] }, SIZE)

    expect(layout.projectionPath).toBe('')
    expect(layout.points.some((point) => point.projected)).toBe(false)
  })

  it('test_no_threshold_means_no_marker', () => {
    const layout = layoutProjection({ history, projection }, SIZE)

    expect(layout.threshold).toBeNull()
    expect(layout.crossing).toBeNull()
  })

  it('test_no_data_is_an_empty_layout', () => {
    const layout = layoutProjection({ history: [], projection: [] }, SIZE)

    expect(layout.months).toEqual([])
    expect(layout.historyPath).toBe('')
    expect(layout.projectionPath).toBe('')
  })
})
