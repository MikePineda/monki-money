/**
 * Sparkline layout for stat tiles: a tiny monotone line scaled to its own
 * min and max (it shows shape, not magnitude; the tile states the value),
 * with the current period as the last known value. Pure.
 */
import { MARKER_OUTER_RADIUS, linePath } from './line'
import { linearScale } from './scales'

/** Keeps the end marker (an 8px dot plus its 2px surface ring) inside the box. */
export const SPARKLINE_INSET = MARKER_OUTER_RADIUS

export interface SparklinePoint {
  index: number
  x: number
  y: number
  value: number
}

export interface SparklineLayout {
  path: string
  points: SparklinePoint[]
  /** The current period: the last known value. */
  last: SparklinePoint | null
}

export function layoutSparkline(
  values: readonly (number | null)[],
  size: { width: number; height: number }
): SparklineLayout {
  const known = values.filter((value): value is number => value !== null && Number.isFinite(value))
  if (known.length === 0) {
    return { path: '', points: [], last: null }
  }
  const step = values.length > 1 ? (size.width - 2 * SPARKLINE_INSET) / (values.length - 1) : 0
  const min = Math.min(...known)
  const max = Math.max(...known)
  const y = linearScale([min, max], [size.height - SPARKLINE_INSET, SPARKLINE_INSET])
  const points: SparklinePoint[] = []
  values.forEach((value, index) => {
    if (value !== null && Number.isFinite(value)) {
      const x = values.length > 1 ? SPARKLINE_INSET + index * step : size.width / 2
      points.push({ index, x, y: y(value), value })
    }
  })
  return { path: linePath(points), points, last: points.at(-1) ?? null }
}
