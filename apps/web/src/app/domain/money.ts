/**
 * Money formatting and keypad entry. Pure: no Angular, no date or money
 * libraries. Amounts are always integer cents; the currency is AUD.
 *
 * Display rules (DESIGN.md, Voice and Amount display): "$" with two decimals
 * and thousands separators in both locales, and the true minus sign U+2212.
 */

export type Cents = number

/** How a sign is shown: `auto` = minus only, `always` = plus or minus, `never` = magnitude. */
export type MoneySign = 'auto' | 'always' | 'never'

export type TransactionKind = 'expense' | 'income' | 'transfer'

export interface FormatMoneyOptions {
  sign?: MoneySign
  /** Round to whole dollars (stat tiles). The hero and tables keep cents. */
  wholeDollars?: boolean
  currency?: string
}

export interface MoneyParts {
  sign: '' | '+' | typeof MINUS_SIGN
  /** Currency symbol and integer part, for example "$2,263". */
  whole: string
  /** Decimal separator and cents, for example ".40"; empty for whole dollars. */
  fraction: string
}

export const MINUS_SIGN = '−'
export const DEFAULT_CURRENCY = 'AUD'

const formatterCache = new Map<string, Intl.NumberFormat>()

function formatter(
  locale: string,
  currency: string,
  wholeDollars: boolean,
  display: 'narrowSymbol' | 'name'
): Intl.NumberFormat {
  const key = `${locale}|${currency}|${wholeDollars}|${display}`
  let cached = formatterCache.get(key)
  if (!cached) {
    const digits = wholeDollars ? 0 : 2
    cached = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: display,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })
    formatterCache.set(key, cached)
  }
  return cached
}

function assertCents(cents: Cents): void {
  if (!Number.isInteger(cents)) {
    throw new RangeError(`Money must be integer cents, got ${cents}`)
  }
}

function signFor(cents: Cents, mode: MoneySign): MoneyParts['sign'] {
  if (mode === 'never' || cents === 0) {
    return ''
  }
  if (cents < 0) {
    return MINUS_SIGN
  }
  return mode === 'always' ? '+' : ''
}

/** Splits a formatted amount so the hero can set the cents in a softer ink. */
export function formatMoneyParts(
  cents: Cents,
  locale: string,
  options: FormatMoneyOptions = {}
): MoneyParts {
  assertCents(cents)
  const { sign = 'auto', wholeDollars = false, currency = DEFAULT_CURRENCY } = options
  const magnitude = Math.abs(cents)
  const parts = formatter(locale, currency, wholeDollars, 'narrowSymbol').formatToParts(
    magnitude / 100
  )
  let whole = ''
  let fraction = ''
  for (const part of parts) {
    if (part.type === 'decimal' || part.type === 'fraction') {
      fraction += part.value
    } else if (part.type !== 'literal' || whole !== '') {
      whole += part.value
    }
  }
  const visibleSign = signFor(wholeDollars ? Math.round(cents / 100) : cents, sign)
  return { sign: visibleSign, whole: whole.trim(), fraction }
}

/** "$1,284.50", "−$42.50", "+$3,200.00" (with `sign: 'always'`). */
export function formatMoney(
  cents: Cents,
  locale: string,
  options: FormatMoneyOptions = {}
): string {
  const { sign, whole, fraction } = formatMoneyParts(cents, locale, options)
  return `${sign}${whole}${fraction}`
}

/**
 * Row amounts by transaction type: expenses carry a minus, income a plus,
 * transfers no sign (they show the arrow glyph instead).
 */
export function formatTransactionAmount(
  cents: Cents,
  kind: TransactionKind,
  locale: string
): string {
  const magnitude = Math.abs(cents)
  switch (kind) {
    case 'expense':
      return formatMoney(-magnitude, locale)
    case 'income':
      return formatMoney(magnitude, locale, { sign: 'always' })
    case 'transfer':
      return formatMoney(magnitude, locale, { sign: 'never' })
  }
}

/** Screen-reader wording, for example "42.50 Australian dollars". */
export function formatMoneySpoken(cents: Cents, locale: string): string {
  assertCents(cents)
  const text = formatter(locale, DEFAULT_CURRENCY, false, 'name').format(Math.abs(cents) / 100)
  return cents < 0 ? `${MINUS_SIGN}${text}` : text
}

/* ------------------------------------------------------------ keypad entry */

export type KeypadDigit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
export type KeypadKey = KeypadDigit | '00' | 'backspace' | 'clear'

/** $999,999.99, the largest amount the keypad accepts. */
export const MAX_KEYPAD_CENTS: Cents = 99_999_999

/**
 * Applies one keypad key. Digits shift in from the cents (4 → $0.04,
 * 4 2 → $0.42, 4 2 5 0 → $42.50); "00" appends two zeros. A key that would
 * pass the maximum is ignored.
 */
export function applyKeypadKey(cents: Cents, key: KeypadKey): Cents {
  switch (key) {
    case 'backspace':
      return Math.floor(cents / 10)
    case 'clear':
      return 0
    case '00': {
      const next = cents * 100
      return next > MAX_KEYPAD_CENTS ? cents : next
    }
    default: {
      const next = cents * 10 + Number(key)
      return next > MAX_KEYPAD_CENTS ? cents : next
    }
  }
}

/** Folds a key sequence into cents, starting from zero. */
export function parseKeypad(keys: readonly KeypadKey[]): Cents {
  return keys.reduce<Cents>((cents, key) => applyKeypadKey(cents, key), 0)
}
