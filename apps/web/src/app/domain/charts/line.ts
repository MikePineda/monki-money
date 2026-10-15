/**
 * Line layout for month series (trend, projection, sparkline). Pure: d3-shape
 * builds the monotone path (no overshoot past the data), d3-scale the axes.
 * One value axis from zero (DESIGN.md: never dual axes).
 */
import { curveMonotoneX, line } from 'd3-shape'
import { bandScale, linearScale, niceTicks, pointPositions, type LinearScale } from './scales'

export interface ChartMargin {
  top: number
  right: number
  bottom: number
  left: number
}

/**
 * Room around the plot: tick labels sit above their gridline in the left
 * gutter, month labels below, and the right edge leaves half a month label.
 */
export const LINE_MARGIN: ChartMargin = { top: 24, right: 16, bottom: 28, left: 40 }

export interface PlotBox {
  left: number
  right: number
  top: number
  bottom: number
}

export interface LineSeriesInput {
  id: string
  /** One value per x position; null is a gap (no marker, the line breaks). */
  values: readonly (number | null)[]
}

export interface LinePoint {
  index: number
  x: number
  y: number
  value: number
}

export interface LineSeriesLayout {
  id: string
  path: string
  points: LinePoint[]
}

export interface Tick {
  value: number
  y: number
}

/** A pointer hit area for one x position (the whole column, never just the mark). */
export interface HitBand {
  index: number
  x: number
  width: number
}

export interface LineLayout {
  width: number
  height: number
  plot: PlotBox
  xs: number[]
  ticks: Tick[]
  /** The y of the zero value, where the baseline rule goes. */
  zeroY: number
  y: LinearScale
  bands: HitBand[]
  series: LineSeriesLayout[]
}

export interface LineLayoutOptions {
  width: number
  height: number
  margin?: Partial<ChartMargin>
  /** At most this many tick intervals (DESIGN.md: $0 / $2k / $4k / $6k). */
  maxTickIntervals?: number
  /** Extra values the axis must show, such as a goal threshold. */
  include?: readonly number[]
}

const pathBuilder = line<{ x: number; y: number }>()
  .x((point) => point.x)
  .y((point) => point.y)
  .curve(curveMonotoneX)

/** A smooth monotone path through the points (empty for no points). */
export function linePath(points: readonly { x: number; y: number }[]): string {
  return points.length === 0 ? '' : (pathBuilder(points) ?? '')
}

/** A path that breaks at gaps: one monotone segment per run of known values. */
function gappedPath(points: readonly LinePoint[]): string {
  const runs: LinePoint[][] = []
  let previous = Number.NaN
  for (const point of points) {
    if (point.index !== previous + 1) {
      runs.push([])
    }
    runs.at(-1)?.push(point)
    previous = point.index
  }
  return runs.map((run) => linePath(run)).join('')
}

export function layoutLine(
  series: readonly LineSeriesInput[],
  options: LineLayoutOptions
): LineLayout {
  const margin = { ...LINE_MARGIN, ...options.margin }
  const { width, height } = options
  const plot: PlotBox = {
    left: margin.left,
    right: width - margin.right,
    top: margin.top,
    bottom: height - margin.bottom,
  }
  const count = Math.max(0, ...series.map((entry) => entry.values.length))
  const known = series.flatMap((entry) =>
    entry.values.filter((value): value is number => value !== null && Number.isFinite(value))
  )
  const domainValues = [0, ...known, ...(options.include ?? [])]
  const nice = niceTicks(
    Math.min(...domainValues),
    Math.max(...domainValues),
    options.maxTickIntervals ?? 3
  )
  const y = linearScale([nice.min, nice.max], [plot.bottom, plot.top])
  const xs = pointPositions(count, [plot.left, plot.right])

  return {
    width,
    height,
    plot,
    xs,
    ticks: nice.values.map((value) => ({ value, y: y(value) })),
    zeroY: y(0),
    y,
    bands: hitBands(xs, plot),
    series: series.map((entry) => {
      const points: LinePoint[] = []
      entry.values.forEach((value, index) => {
        const x = xs[index]
        if (value !== null && Number.isFinite(value) && x !== undefined) {
          points.push({ index, x, y: y(value), value })
        }
      })
      return { id: entry.id, path: gappedPath(points), points }
    }),
  }
}

/**
 * Contiguous columns centred on each x, splitting the space between
 * neighbours, so the crosshair answers anywhere in the plot rather than only
 * on a 2px line (dataviz: hit areas at least 24px, here a whole month wide).
 */
function hitBands(xs: readonly number[], plot: PlotBox): HitBand[] {
  if (xs.length === 0) {
    return []
  }
  const first = xs[0] ?? plot.left
  const last = xs.at(-1) ?? plot.right
  const step = xs.length > 1 ? (last - first) / (xs.length - 1) : plot.right - plot.left
  const keys = xs.map((_, index) => String(index))
  const band = bandScale(keys, [first - step / 2, last + step / 2])
  return keys.map((key, index) => ({
    index,
    x: band.position(key) ?? 0,
    width: band.bandwidth,
  }))
}

/** The index of the x nearest to a pointer position (ties go left); -1 without points. */
export function nearestIndex(xs: readonly number[], px: number): number {
  let best = -1
  let bestDistance = Number.POSITIVE_INFINITY
  xs.forEach((x, index) => {
    const distance = Math.abs(x - px)
    if (distance < bestDistance) {
      best = index
      bestDistance = distance
    }
  })
  return best
}

/**
 * Which x positions get a label: all of them when they fit at `minSpacing`
 * px apart, otherwise every n-th counted back from the latest month, so the
 * current month is always labelled.
 */
export function xLabelIndices(count: number, plotWidth: number, minSpacing = 36): number[] {
  if (count <= 0) {
    return []
  }
  const stride = Math.max(1, Math.ceil((count * minSpacing) / Math.max(1, plotWidth)))
  const indices: number[] = []
  for (let index = 0; index < count; index++) {
    if ((count - 1 - index) % stride === 0) {
      indices.push(index)
    }
  }
  return indices
}

/**
 * Marker geometry (dataviz, Marks): an 8px fill (r 4) inside a 2px ring in
 * the surface colour, drawn as r 5 with a 2px stroke, so the ring sits
 * outside the fill and the whole mark reaches 6px from its centre.
 */
export const MARKER_RADIUS = 5
export const MARKER_OUTER_RADIUS = 6

/** Approximate advance of a 13px tabular figure, to reserve room for end labels. */
const END_LABEL_CHAR_WIDTH = 7.5
/** Space between a marker's ring and its end label. */
export const END_LABEL_GAP = 4

/**
 * Right margin that fits the widest end-of-line label beside its marker
 * (dataviz: lines carry their value at the end), so the label never sits on
 * the line it names. Zero when there is nothing to label.
 */
export function endLabelRoom(labels: readonly string[]): number {
  if (labels.length === 0) {
    return 0
  }
  const widest = Math.max(...labels.map((label) => label.length))
  return Math.ceil(widest * END_LABEL_CHAR_WIDTH) + MARKER_OUTER_RADIUS + END_LABEL_GAP
}

/**
 * Whether any two end labels would sit closer than `minGap` px. Colliding
 * labels are dropped, never nudged apart: the legend and the tooltip carry
 * the values instead (dataviz, Labels).
 */
export function labelsCollide(ys: readonly number[], minGap = 16): boolean {
  const sorted = [...ys].sort((a, b) => a - b)
  return sorted.some((y, index) => index > 0 && y - (sorted[index - 1] ?? y) < minGap)
}
