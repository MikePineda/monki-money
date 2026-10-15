import type { Month } from '#domain/calendar/month'
import type { Flow, Posting } from '#domain/ledger/posting'
import { summarizeMonth, type MonthSummary } from '#domain/reports/month_summary'

/**
 * Month-over-month views built from `summarizeMonth`, so every number in a
 * trend matches the month screen exactly (same transfer, refund, split and
 * privacy rules). Same sign convention: positive on its own side.
 */

export type MonthTotals = {
  month: Month
  incomeCents: number
  expenseCents: number
  netCents: number
}

export type SeriesPoint = {
  month: Month
  amountCents: number
}

export type TrendGroupBy = 'group' | 'category'

export type TrendSeries = {
  bucket: 'group' | 'category' | 'uncategorized' | 'private'
  /** Group or category id (null for the uncategorized/private buckets). */
  id: number | null
  kind: Flow
  totalCents: number
  points: SeriesPoint[]
}

export type CategoryTrend = {
  categoryId: number
  kind: Flow
  totalCents: number
  /** Rounded mean over the requested months (empty months count as zero). */
  averageCents: number
  points: SeriesPoint[]
}

export type Mover = {
  categoryId: number
  groupId: number | null
  previousCents: number
  currentCents: number
  /** current - previous: positive = spent more. */
  deltaCents: number
}

function summaries(postings: Posting[], months: Month[]): MonthSummary[] {
  return months.map((month) => summarizeMonth(postings, month))
}

/** Income, expense and net per month, one entry per requested month. */
export function trend(postings: Posting[], months: Month[]): MonthTotals[] {
  return summaries(postings, months).map(({ month, incomeCents, expenseCents, netCents }) => ({
    month,
    incomeCents,
    expenseCents,
    netCents,
  }))
}

/** One series per group (or category) with a point for every month. */
export function breakdownTrend(
  postings: Posting[],
  months: Month[],
  groupBy: TrendGroupBy
): TrendSeries[] {
  const series = new Map<string, TrendSeries>()

  for (const [index, summary] of summaries(postings, months).entries()) {
    const lines =
      groupBy === 'group'
        ? summary.byGroup.map((line) => ({ ...line, id: line.groupId }))
        : summary.byCategory.map((line) => ({ ...line, id: line.categoryId }))

    for (const line of lines) {
      const key = `${line.bucket}:${line.id}:${line.kind}`
      let entry = series.get(key)
      if (!entry) {
        entry = {
          bucket: line.bucket,
          id: line.id,
          kind: line.kind,
          totalCents: 0,
          points: months.map((month) => ({ month, amountCents: 0 })),
        }
        series.set(key, entry)
      }
      entry.points[index].amountCents += line.amountCents
      entry.totalCents += line.amountCents
    }
  }

  return [...series.values()].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'expense' ? -1 : 1
    if (a.totalCents !== b.totalCents) return b.totalCents - a.totalCents
    return (a.id ?? Number.MAX_SAFE_INTEGER) - (b.id ?? Number.MAX_SAFE_INTEGER)
  })
}

/** Monthly amounts of one category, on the side of its group. */
export function categoryTrend(
  postings: Posting[],
  category: { id: number; kind: Flow },
  months: Month[]
): CategoryTrend {
  const points = summaries(postings, months).map((summary) => ({
    month: summary.month,
    amountCents: summary.byCategory
      .filter((line) => line.bucket === 'category' && line.categoryId === category.id)
      .reduce((total, line) => total + line.amountCents, 0),
  }))
  const totalCents = points.reduce((total, point) => total + point.amountCents, 0)

  return {
    categoryId: category.id,
    kind: category.kind,
    totalCents,
    averageCents: months.length === 0 ? 0 : Math.round(totalCents / months.length),
    points,
  }
}

/**
 * Expense categories whose spending changed the most between two months,
 * biggest absolute change first. Uncategorized and private amounts are not
 * categories and never show up here.
 */
export function topMovers(previous: MonthSummary, current: MonthSummary, limit = 5): Mover[] {
  const movers = new Map<number, Mover>()
  const entry = (categoryId: number, groupId: number | null) => {
    const existing = movers.get(categoryId)
    if (existing) return existing
    const created = { categoryId, groupId, previousCents: 0, currentCents: 0, deltaCents: 0 }
    movers.set(categoryId, created)
    return created
  }

  for (const [summary, field] of [
    [previous, 'previousCents'],
    [current, 'currentCents'],
  ] as const) {
    for (const line of summary.byCategory) {
      if (line.bucket !== 'category' || line.kind !== 'expense' || line.categoryId === null) {
        continue
      }
      entry(line.categoryId, line.groupId)[field] += line.amountCents
    }
  }

  return [...movers.values()]
    .map((mover) => ({ ...mover, deltaCents: mover.currentCents - mover.previousCents }))
    .filter((mover) => mover.deltaCents !== 0)
    .sort((a, b) => Math.abs(b.deltaCents) - Math.abs(a.deltaCents) || a.categoryId - b.categoryId)
    .slice(0, limit)
}
