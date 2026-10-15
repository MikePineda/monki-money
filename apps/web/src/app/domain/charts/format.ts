/**
 * Number formatting for chart chrome. Pure. Full amounts (tooltips, tables,
 * legends) go through domain/money.ts; this module adds the compact axis
 * form and whole percentages.
 */
import { DEFAULT_CURRENCY, MINUS_SIGN, formatMoney, type Cents } from '../money'

const COMPACT_UNITS = [
  { size: 1_000_000, suffix: 'M' },
  { size: 1_000, suffix: 'k' },
] as const

const compactFormatters = new Map<string, Intl.NumberFormat>()

function compactFormatter(locale: string, currency: string): Intl.NumberFormat {
  const key = `${locale}|${currency}`
  let cached = compactFormatters.get(key)
  if (!cached) {
    cached = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    })
    compactFormatters.set(key, cached)
  }
  return cached
}

/**
 * Axis-tick money (DESIGN.md: "$0", "$2k", "$4k"): whole dollars below
 * $1,000, then one optional decimal and a lowercase k or M in every locale
 * (Intl's compact notation gives "$2K" in en-AU and "$2 k" in es-MX).
 */
export function compactMoney(cents: Cents, locale: string, currency = DEFAULT_CURRENCY): string {
  const dollars = Math.round(Math.abs(cents) / 100)
  const unit = COMPACT_UNITS.find(({ size }) => dollars >= size)
  if (!unit) {
    return formatMoney(Math.sign(cents) * dollars * 100, locale, { wholeDollars: true, currency })
  }
  const scaled = Math.round((dollars / unit.size) * 10) / 10
  const parts = compactFormatter(locale, currency).formatToParts(scaled)
  // The suffix goes right after the last digit, before any trailing symbol.
  const lastDigit = parts.reduce(
    (last, part, index) => (part.type === 'integer' || part.type === 'fraction' ? index : last),
    -1
  )
  const text = parts
    .map((part, index) => (index === lastDigit ? `${part.value}${unit.suffix}` : part.value))
    .join('')
  return cents < 0 ? `${MINUS_SIGN}${text}` : text
}

/**
 * Whole percentages of the positive values that always add up to 100
 * (largest remainder; ties go to the earlier item). Zero and negative
 * values get 0, and nothing to share gives all zeros.
 */
export function percentShares(values: readonly number[]): number[] {
  const positive = values.map((value) => Math.max(0, value))
  const total = positive.reduce((sum, value) => sum + value, 0)
  if (total <= 0) {
    return values.map(() => 0)
  }
  const exact = positive.map((value) => (value / total) * 100)
  const result = exact.map((value) => Math.floor(value))
  let missing = 100 - result.reduce((sum, value) => sum + value, 0)
  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .filter(({ index }) => (positive[index] ?? 0) > 0)
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
  for (const { index } of byRemainder) {
    if (missing <= 0) {
      break
    }
    result[index] = (result[index] ?? 0) + 1
    missing--
  }
  return result
}

const percentFormatters = new Map<string, Intl.NumberFormat>()

/** A whole percentage (46 → "46%") with the locale's percent sign. */
export function formatPercent(percent: number, locale: string): string {
  let format = percentFormatters.get(locale)
  if (!format) {
    format = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 })
    percentFormatters.set(locale, format)
  }
  return format.format(percent / 100)
}
