/**
 * 100%-stacked bar layout (DESIGN.md, "Quién pagó"). Pure. Segments are
 * separated by 2px surface gaps; the first starts square at the baseline and
 * only the last carries the rounded data end.
 */
import { percentShares } from './format'

/** The surface gap between touching segments (dataviz: 2px, never a stroke). */
export const STACK_GAP = 2

export interface StackedInput {
  id: string
  valueCents: number
}

export interface StackedPart {
  id: string
  valueCents: number
  /** Exact share of the total (0 to 1). */
  share: number
  /** Whole percent; all parts add up to 100. */
  percent: number
}

export interface StackedSegment extends StackedPart {
  x: number
  width: number
  first: boolean
  last: boolean
}

export interface StackedLayout {
  /** Every input, in input order, for the legend and the table. */
  parts: StackedPart[]
  /** Only the positive parts, positioned along the bar. */
  segments: StackedSegment[]
  totalCents: number
}

/** The data-end radius for bars and columns (dataviz: 4px). */
export const DATA_END_RADIUS = 4

/**
 * A horizontal bar growing to the right: square at the baseline (left) and
 * rounded at the data end (right). The radius shrinks for slivers.
 */
export function dataEndPath(x: number, y: number, width: number, height: number): string {
  const r = Math.max(0, Math.min(DATA_END_RADIUS, width, height / 2))
  const end = x + width
  return (
    `M${x},${y}H${end - r}A${r},${r} 0 0 1 ${end},${y + r}` +
    `V${y + height - r}A${r},${r} 0 0 1 ${end - r},${y + height}H${x}Z`
  )
}

export function layoutStacked100(
  data: readonly StackedInput[],
  width: number,
  gap = STACK_GAP
): StackedLayout {
  const positiveTotal = data.reduce((sum, item) => sum + Math.max(0, item.valueCents), 0)
  const percents = percentShares(data.map((item) => item.valueCents))
  const parts: StackedPart[] = data.map((item, index) => ({
    id: item.id,
    valueCents: item.valueCents,
    share: positiveTotal > 0 ? Math.max(0, item.valueCents) / positiveTotal : 0,
    percent: percents[index] ?? 0,
  }))
  const visible = parts.filter((part) => part.valueCents > 0)
  const available = Math.max(0, width - gap * Math.max(0, visible.length - 1))
  let cumulative = 0
  const segments = visible.map((part, index) => {
    const x = cumulative * available + index * gap
    cumulative += part.share
    return {
      ...part,
      x,
      width: part.share * available,
      first: index === 0,
      last: index === visible.length - 1,
    }
  })
  return { parts, segments, totalCents: positiveTotal }
}
