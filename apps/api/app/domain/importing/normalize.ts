import { InvalidBankValueError } from '#domain/importing/errors'
import { daysBetween, isoDate, isValidDate } from '#domain/importing/iso_days'

/**
 * Pure readers for the values a NAB export writes: dates such as
 * `27 Sept 26`, amounts such as `-.50`, card prefixes, purchase-date tokens
 * and merchant names. No floats ever touch money.
 */

const MONTHS: Readonly<Record<string, number>> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
}

const NAB_DATE = /^(\d{1,2})\s+([a-z]{3,9})\s+(\d{2}|\d{4})$/i

/**
 * `27 Sept 26` -> `2026-09-27`. NAB spells months inconsistently (`Sept`,
 * `July`, `June`, `Aug`), so only the first three letters count.
 */
export function parseNabDate(value: string): string {
  const match = NAB_DATE.exec(value.trim())
  const month = match ? MONTHS[match[2].slice(0, 3).toLowerCase()] : undefined
  if (!match || month === undefined) throw new InvalidBankValueError('date', value)

  const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3])
  const day = Number(match[1])
  if (!isValidDate(year, month, day)) throw new InvalidBankValueError('date', value)
  return isoDate(year, month, day)
}

const AMOUNT = /^([+-])?(\d{0,12})(?:\.(\d{1,2}))?$/

/**
 * `-.50` -> -50, `.91` -> 91, `-0.00` -> 0 (never -0). Integer arithmetic on
 * the digits; at most two decimals and twelve integer digits.
 */
export function parseAmountToCents(value: string): number {
  const match = AMOUNT.exec(value.trim())
  if (!match || (match[2] === '' && match[3] === undefined)) {
    throw new InvalidBankValueError('amount', value)
  }

  const units = match[2] === '' ? 0 : Number(match[2])
  const fraction = match[3] === undefined ? 0 : Number(match[3].padEnd(2, '0'))
  const cents = units * 100 + fraction
  if (cents === 0) return 0
  return match[1] === '-' ? -cents : cents
}

/** Card or channel prefix NAB puts before the purchase date. */
const PURCHASE_DATE = /^(?:V\d{4}|POS|EFTPOS)\s+(\d{2})\/(\d{2})(?!\d)/i

/** Posting lag beyond which a `dd/mm` token is not a purchase date (observed lag: 0-7 days). */
export const MAX_PURCHASE_LAG_DAYS = 31

/**
 * Purchase date from the `dd/mm` token after the card prefix
 * (`V1111 30/12 ...`). The year is the bank date's, rolled back one year
 * when that would put the purchase after the posting (a `30/12` purchase
 * posted on `02 Jan`). Null when there is no token or it is implausible.
 */
export function extractPurchaseDate(details: string, bankDate: string): string | null {
  const match = PURCHASE_DATE.exec(details.trim())
  if (!match) return null

  const day = Number(match[1])
  const month = Number(match[2])
  const bankYear = Number(bankDate.slice(0, 4))
  const year = isoDate(bankYear, month, day) > bankDate ? bankYear - 1 : bankYear
  if (!isValidDate(year, month, day)) return null

  const purchaseDate = isoDate(year, month, day)
  return daysBetween(purchaseDate, bankDate) <= MAX_PURCHASE_LAG_DAYS ? purchaseDate : null
}

/** The date a row counts on: the purchase date when the details carry one, else the bank date. */
export function effectiveDate(details: string, bankDate: string): string {
  return extractPurchaseDate(details, bankDate) ?? bankDate
}

/**
 * Details without the bank's noise: card/channel prefix (`V1111`, `POS`,
 * `EFTPOS`, `ONLINE`), purchase date, time, payment references
 * (`A1234567890`) and the trailing 11-digit authorisation code.
 * `V1111 22/09 RIVERSIDE DELI EASTBROOK 70000000999` -> `RIVERSIDE DELI EASTBROOK`.
 */
export function normalizeDescription(details: string): string {
  return details
    .trim()
    .replace(/^(?:V\d{4}|POS|EFTPOS|ONLINE)\b\s*/i, '')
    .replace(/^\d{2}\/\d{2}(?!\d)\s*/, '')
    .replace(/^\d{2}:\d{2}\s*/, '')
    .replace(/\b[A-Z]\d{10}\b/g, ' ')
    .replace(/\s\d{11}\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface MerchantSource {
  nabMerchant: string | null
  /** Normalized description, used when the bank names no merchant. */
  description: string
}

/** Lowercase ASCII words; tokens with digits (store numbers, invoices) are dropped. */
function keyOf(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['\u2019]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token !== '' && !/\d/.test(token))
    .join(' ')
}

function merchantName(source: MerchantSource): string {
  const name = source.nabMerchant?.trim()
  return name ? name : source.description
}

/**
 * Full merchant key: `GrocerMart (Northvale Village)` -> `grocermart northvale
 * village`. Prefers the bank's merchant name over the description. Learned
 * rules use this as their pattern.
 */
export function merchantFullKey(source: MerchantSource): string {
  return keyOf(merchantName(source))
}

/** Base merchant key, without the branch: `GrocerMart (Northvale Village)` -> `grocermart`. */
export function merchantKey(source: MerchantSource): string {
  return keyOf(merchantName(source).replace(/\([^)]*\)/g, ' '))
}

/** Card suffix of a card purchase (`V1111 ...` -> `1111`). */
export function cardSuffix(details: string): string | null {
  return /^V(\d{4})\b/.exec(details.trim())?.[1] ?? null
}

/** NAB leaves `Processed On` empty while a row is still pending. */
export function isPending(processedOn: string): boolean {
  return processedOn.trim() === ''
}
