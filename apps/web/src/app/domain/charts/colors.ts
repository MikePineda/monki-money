/**
 * Chart mark colours as design tokens. Pure: a colour is a token name, and
 * the CSS custom property behind it carries the light and dark steps, so a
 * chart never holds a raw colour and dark mode comes from styles.css.
 *
 * Rules (DESIGN.md, Charts > Colour; dataviz skill):
 * - one series is `neutral` (expense is ink, in charts too);
 * - "Other" and shared buckets are `muted`;
 * - people are `person-a` / `person-b`, and only on person series;
 * - categorical series take `series-1..8` in a fixed order, assigned by
 *   entity and never by rank, and a ninth hue is never generated;
 * - the accent is never a mark, so it is not a chart colour at all.
 */
export const SERIES_SLOTS = 8

export type SeriesSlot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

export type ChartColor = 'neutral' | 'muted' | 'person-a' | 'person-b' | `series-${SeriesSlot}`

const TOKENS: Record<ChartColor, string> = {
  'neutral': '--mark-neutral',
  'muted': '--mark-muted',
  'person-a': '--person-a',
  'person-b': '--person-b',
  'series-1': '--series-1',
  'series-2': '--series-2',
  'series-3': '--series-3',
  'series-4': '--series-4',
  'series-5': '--series-5',
  'series-6': '--series-6',
  'series-7': '--series-7',
  'series-8': '--series-8',
}

/** The CSS value for a mark colour, for example `var(--mark-neutral)`. */
export function chartColorVar(color: ChartColor): string {
  return `var(${TOKENS[color]})`
}

/**
 * The categorical colour of the series at a stable, zero-based entity index.
 * Throws past the eighth slot: fold the tail into "Other" instead of cycling.
 */
export function seriesColor(index: number): ChartColor {
  if (!Number.isInteger(index) || index < 0 || index >= SERIES_SLOTS) {
    throw new RangeError(`Series index ${index} is outside the ${SERIES_SLOTS} categorical slots`)
  }
  return `series-${(index + 1) as SeriesSlot}`
}
