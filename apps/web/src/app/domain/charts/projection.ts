/**
 * Projection layout (goals, later): a solid line for actual months and a
 * projected segment, the only dashed mark the charts allow, that continues
 * from the last actual month. An optional threshold (the goal) widens the
 * axis and the first month that reaches it gets a marker; an optional
 * marker month (the goal's target date) gets a vertical reference line when
 * it is on the axis. Pure.
 */
import { layoutLine, linePath, type LineLayout, type LineLayoutOptions } from './line'

export interface MonthValue {
  /** 'YYYY-MM'. */
  x: string
  valueCents: number
}

export interface ProjectionInput {
  history: readonly MonthValue[]
  /** Estimated months after the last actual one; earlier ones are ignored. */
  projection: readonly MonthValue[]
  thresholdCents?: number | null
  /** Last month to draw ('YYYY-MM'); projected months after it are trimmed. */
  horizon?: string | null
  /** A month to mark with a vertical line ('YYYY-MM', the target date). */
  markerMonth?: string | null
}

export interface ProjectionPoint {
  index: number
  month: string
  x: number
  y: number
  valueCents: number
  projected: boolean
}

export interface ProjectionCrossing {
  index: number
  month: string
  x: number
  y: number
  projected: boolean
}

export interface ProjectionLayout {
  months: string[]
  line: LineLayout
  historyPath: string
  /** Starts at the last actual point; empty without projected months. */
  projectionPath: string
  points: ProjectionPoint[]
  threshold: { valueCents: number; y: number } | null
  /** The first drawn month that reaches the threshold. */
  crossing: ProjectionCrossing | null
  /** Set when the goal is only reached after the horizon, in this month. */
  beyondHorizon: { month: string } | null
  /** The marker month's position; null when it is not on the axis. */
  marker: { month: string; x: number } | null
}

/** Index of the first value that reaches the threshold from the side the series starts on. */
function firstReaching(values: readonly number[], threshold: number): number {
  const start = values[0]
  if (start === undefined) {
    return -1
  }
  const rising = start <= threshold
  return values.findIndex((value) => (rising ? value >= threshold : value <= threshold))
}

export function layoutProjection(
  input: ProjectionInput,
  size: Pick<LineLayoutOptions, 'width' | 'height' | 'margin'>
): ProjectionLayout {
  const lastActual = input.history.at(-1)?.x ?? ''
  const future = input.projection.filter((point) => point.x > lastActual)
  const horizon = input.horizon ?? null
  const drawnFuture = horizon ? future.filter((point) => point.x <= horizon) : future
  const all = [
    ...input.history.map((point) => ({ ...point, projected: false })),
    ...drawnFuture.map((point) => ({ ...point, projected: true })),
  ]
  const threshold = input.thresholdCents ?? null

  const line = layoutLine([{ id: 'projection', values: all.map((point) => point.valueCents) }], {
    ...size,
    include: threshold === null ? [] : [threshold],
  })
  const points: ProjectionPoint[] = all.map((point, index) => ({
    index,
    month: point.x,
    x: line.xs[index] ?? 0,
    y: line.y(point.valueCents),
    valueCents: point.valueCents,
    projected: point.projected,
  }))
  const actual = points.filter((point) => !point.projected)
  const projected = points.filter((point) => point.projected)
  const joint = actual.at(-1)

  let crossing: ProjectionCrossing | null = null
  let beyondHorizon: ProjectionLayout['beyondHorizon'] = null
  if (threshold !== null) {
    const index = firstReaching(
      all.map((point) => point.valueCents),
      threshold
    )
    const hit = points[index]
    if (hit) {
      crossing = { index, month: hit.month, x: hit.x, y: hit.y, projected: hit.projected }
    } else {
      const everything = [...input.history, ...future].map((point) => point.valueCents)
      const later = [...input.history, ...future][firstReaching(everything, threshold)]
      beyondHorizon = later ? { month: later.x } : null
    }
  }

  return {
    months: all.map((point) => point.x),
    line,
    historyPath: linePath(actual),
    projectionPath: projected.length > 0 ? linePath(joint ? [joint, ...projected] : projected) : '',
    points,
    threshold: threshold === null ? null : { valueCents: threshold, y: line.y(threshold) },
    crossing,
    beyondHorizon,
    marker: markerOn(points, input.markerMonth ?? null),
  }
}

function markerOn(
  points: readonly ProjectionPoint[],
  month: string | null
): ProjectionLayout['marker'] {
  const point = month === null ? undefined : points.find((item) => item.month === month)
  return point ? { month: point.month, x: point.x } : null
}
