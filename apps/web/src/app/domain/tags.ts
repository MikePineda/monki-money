/**
 * Free tags on transactions (a trip, an event) and the numbers of the tag
 * screens, built from `GET /tags` and `GET /tags/:tag`. Pure: no Angular.
 * Amounts follow the reports' convention (positive on their own side).
 */
import type { BarListDatum } from './charts/bar-list'
import { monthOf, type YearMonth } from './month'
import { normalizeForSearch } from './text'

/** Suggestions shown under the tag field. */
export const TAG_SUGGESTIONS = 8

/**
 * Tags to offer while typing: the household's tags in the order given
 * (most recently used first), minus the ones already chosen. Typed text
 * narrows them (case and accents ignored): tags that start with it first,
 * then the ones that contain it, each group keeping its recency order.
 */
export function suggestTags(
  known: readonly string[],
  chosen: readonly string[],
  typed: string,
  limit = TAG_SUGGESTIONS
): string[] {
  const query = normalizeForSearch(typed)
  const available = known.filter((tag) => !chosen.includes(tag))
  if (!query) {
    return available.slice(0, limit)
  }
  const starts: string[] = []
  const contains: string[] = []
  for (const tag of available) {
    const text = normalizeForSearch(tag)
    if (text.startsWith(query)) {
      starts.push(tag)
    } else if (text.includes(query)) {
      contains.push(tag)
    }
  }
  return [...starts, ...contains].slice(0, limit)
}

/** A line of `byCategory` as the tag report sends it. */
export interface TagCategoryLine {
  bucket: string
  categoryId: number | null
  kind: string
  amountCents: number
}

/**
 * "Spend by category" for a tag: one bar per category the tag spent in
 * (refunds already netted), uncategorised spending as a muted "Other" bar.
 * Income and categories whose refunds outweigh their spending draw nothing.
 */
export function tagSpending(
  byCategory: readonly TagCategoryLine[],
  labels: { category: (id: number) => string; uncategorized: string }
): BarListDatum[] {
  return byCategory
    .filter((line) => line.kind === 'expense' && line.amountCents > 0)
    .map((line) =>
      line.bucket === 'category' && line.categoryId !== null
        ? {
            id: `category:${line.categoryId}`,
            label: labels.category(line.categoryId),
            valueCents: line.amountCents,
          }
        : {
            id: 'uncategorized',
            label: labels.uncategorized,
            valueCents: line.amountCents,
            other: true,
          }
    )
}

/** A month of the tag report (`byMonth`). */
export interface TagMonthLine {
  month: string
  expenseCents: number
  incomeCents: number
  setAsideCents: number
}

export type TagSeries = 'spent' | 'setAside'

/**
 * The tag's monthly trend in the trend line's data shape: money spent each
 * month, plus the money set aside when there was any (a trip saved for
 * months before it happened).
 */
export function tagTrend(byMonth: readonly TagMonthLine[]): {
  series: TagSeries[]
  data: { x: string; series: { id: TagSeries; valueCents: number }[] }[]
} {
  const withSetAside = byMonth.some((line) => line.setAsideCents > 0)
  const series: TagSeries[] = withSetAside ? ['spent', 'setAside'] : ['spent']
  return {
    series,
    data: byMonth.map((line) => ({
      x: line.month,
      series: series.map((id) => ({
        id,
        valueCents: id === 'spent' ? line.expenseCents : line.setAsideCents,
      })),
    })),
  }
}

/** The months a tag spans: its first and last month, one when they match, none without dates. */
export function tagPeriod(firstDate: string | null, lastDate: string | null): YearMonth[] {
  if (!firstDate || !lastDate) {
    return []
  }
  const first = monthOf(firstDate)
  const last = monthOf(lastDate)
  return first === last ? [first] : [first, last]
}
