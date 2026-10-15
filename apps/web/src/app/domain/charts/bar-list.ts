/**
 * Bar-list layout: horizontal bars, one row per group, with expandable
 * children (DESIGN.md, "Gasto por categoría"). Pure. Lengths are fractions
 * of one shared scale, so the component can draw them at any width.
 */
import type { ChartColor } from './colors'
import { percentShares } from './format'

export interface BarListDatum {
  /** Stable key (a category id); defaults to the label. */
  id?: string
  label: string
  valueCents: number
  /** Mark colour; omitted on single-series lists, which use the neutral mark. */
  color?: ChartColor
  /** An "Other" bucket: muted mark and always listed last. */
  other?: boolean
  children?: readonly BarListDatum[]
}

export interface BarListRow {
  id: string
  label: string
  valueCents: number
  color: ChartColor
  /** Bar length, 0 to 1, against the largest value in the list. */
  fraction: number
  /** Share of the list total (0 to 1). */
  share: number
  /** Whole percent of the total; top-level rows add up to 100. */
  percent: number
  depth: 0 | 1
  parentId: string | null
  expandable: boolean
  expanded: boolean
}

export interface BarListLayout {
  rows: BarListRow[]
  /** Sum of the top-level values. */
  totalCents: number
  /** The value a full-length bar stands for (0 when nothing is positive). */
  maxCents: number
}

interface Keyed {
  id: string
  datum: BarListDatum
}

/** Largest first; "Other" buckets last; stable for equal values. */
function sorted(items: readonly Keyed[]): Keyed[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        Number(a.item.datum.other ?? false) - Number(b.item.datum.other ?? false) ||
        b.item.datum.valueCents - a.item.datum.valueCents ||
        a.index - b.index
    )
    .map(({ item }) => item)
}

/**
 * Rows in display order: groups sorted by amount with "Other" pinned last,
 * and each expanded group followed by its own sorted children.
 */
export function layoutBarList(
  data: readonly BarListDatum[],
  expandedIds: readonly string[],
  defaultColor: ChartColor = 'neutral'
): BarListLayout {
  const groups = sorted(data.map((datum) => ({ id: datum.id ?? datum.label, datum })))
  const expanded = new Set(expandedIds)
  const totalCents = groups.reduce((sum, { datum }) => sum + datum.valueCents, 0)
  const allValues = groups.flatMap(({ datum }) => [
    datum.valueCents,
    ...(datum.children ?? []).map((child) => child.valueCents),
  ])
  const maxCents = Math.max(0, ...allValues)
  const fraction = (value: number) => (maxCents > 0 ? Math.max(0, value) / maxCents : 0)
  const share = (value: number) => (totalCents > 0 ? value / totalCents : 0)
  const percents = percentShares(groups.map(({ datum }) => datum.valueCents))

  const rows: BarListRow[] = []
  groups.forEach(({ id, datum }, index) => {
    const color = datum.color ?? (datum.other ? 'muted' : defaultColor)
    const children = datum.children ?? []
    const isExpanded = children.length > 0 && expanded.has(id)
    rows.push({
      id,
      label: datum.label,
      valueCents: datum.valueCents,
      color,
      fraction: fraction(datum.valueCents),
      share: share(datum.valueCents),
      percent: percents[index] ?? 0,
      depth: 0,
      parentId: null,
      expandable: children.length > 0,
      expanded: isExpanded,
    })
    if (!isExpanded) {
      return
    }
    const keyedChildren = children.map((child) => ({
      id: child.id ?? `${id}/${child.label}`,
      datum: child,
    }))
    for (const child of sorted(keyedChildren)) {
      rows.push({
        id: child.id,
        label: child.datum.label,
        valueCents: child.datum.valueCents,
        color: child.datum.color ?? color,
        fraction: fraction(child.datum.valueCents),
        share: share(child.datum.valueCents),
        percent: Math.round(share(child.datum.valueCents) * 100),
        depth: 1,
        parentId: id,
        expandable: false,
        expanded: false,
      })
    }
  })
  return { rows, totalCents, maxCents }
}
