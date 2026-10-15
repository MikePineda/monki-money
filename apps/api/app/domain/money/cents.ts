/**
 * Money is integer cents end to end. These helpers never go through floats
 * for arithmetic (display formatting is the only place a division by 100
 * happens).
 */

const AMOUNT = /^([+-])?\$?([+-])?(\d{1,3}(?:,\d{3})+|\d*)(?:\.(\d{1,2}))?$/

/**
 * Reads a human or bank amount ('12.34', '-.50', '$1,234.56', '7') as
 * integer cents by parsing the digits as text. Returns null when the input
 * is not an amount with at most two decimals.
 */
export function parseCents(input: string): number | null {
  const match = AMOUNT.exec(input.trim())
  if (!match) return null

  const [, outerSign, innerSign, wholeRaw, fractionRaw] = match
  if (outerSign && innerSign) return null
  const whole = (wholeRaw ?? '').replaceAll(',', '')
  const fraction = fractionRaw ?? ''
  if (whole === '' && fraction === '') return null

  const cents = Number(whole || '0') * 100 + Number(fraction.padEnd(2, '0') || '0')
  const sign = (outerSign ?? innerSign) === '-' ? -1 : 1
  return cents === 0 ? 0 : sign * cents
}

/** Sum of integer cents; a non-integer is a bug upstream and throws. */
export function sumCents(values: Iterable<number>): number {
  let total = 0
  for (const value of values) {
    if (!Number.isInteger(value)) throw new TypeError(`Not an amount in cents: ${value}`)
    total += value
  }
  return total
}

/**
 * Splits `totalCents` in `parts` lines whose sum is exactly the total. The
 * whole remainder goes to the first line ("the first line absorbs the odd
 * cents"), keeping every other line equal. The sign follows the total.
 */
export function splitEvenly(totalCents: number, parts: number): number[] {
  if (!Number.isInteger(totalCents)) throw new TypeError(`Not an amount in cents: ${totalCents}`)
  if (!Number.isInteger(parts) || parts < 1) throw new RangeError(`Invalid parts: ${parts}`)

  const sign = totalCents < 0 ? -1 : 1
  const absolute = Math.abs(totalCents)
  const base = Math.floor(absolute / parts)
  const remainder = absolute - base * parts

  return Array.from({ length: parts }, (_, index) => {
    const line = index === 0 ? base + remainder : base
    return line === 0 ? 0 : sign * line
  })
}

/** Exact decimal string for CSV and other machine formats: -1234 -> '-12.34'. */
export function centsToDecimal(cents: number): string {
  if (!Number.isInteger(cents)) throw new TypeError(`Not an amount in cents: ${cents}`)
  const absolute = Math.abs(cents)
  const whole = Math.floor(absolute / 100)
  const fraction = String(absolute % 100).padStart(2, '0')
  return `${cents < 0 ? '-' : ''}${whole}.${fraction}`
}

export interface FormatCentsOptions {
  /** BCP 47 locale. Default 'en-AU'. */
  locale?: string
  /** ISO 4217 code. Default 'AUD'. */
  currency?: string
}

/** Display string for people: 123456 -> '$1,234.56' (en-AU, AUD). */
export function formatCents(cents: number, options: FormatCentsOptions = {}): string {
  return new Intl.NumberFormat(options.locale ?? 'en-AU', {
    style: 'currency',
    currency: options.currency ?? 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}
