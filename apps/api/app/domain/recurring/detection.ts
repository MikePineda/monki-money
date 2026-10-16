import type { RecurringCadence } from '@monkimoney/shared'
import { RECURRING_CADENCES } from '@monkimoney/shared'
import { addDays } from '#domain/importing/iso_days'
import { addCadence, nextDueOnOrAfter, stepsBetween } from '#domain/recurring/cadence'

/**
 * Finds recurring payments (rent, phone, gym, subscriptions) in a
 * household's spending. Pure: it receives the payments and "today" and
 * never reads the database or the clock.
 *
 * A merchant (its merchant key) is recurring when, among its payments:
 * 1. at least MIN_OCCURRENCES amounts sit within the tolerance of the
 *    typical amount (the median of its three latest payments, so a one-off
 *    purchase at the same merchant or an old price does not count);
 * 2. the dates of those payments follow one cadence: every gap is one step
 *    or, at most, two (a missed payment), and at least REGULAR_SHARE of
 *    the gaps are exactly one step;
 * 3. the pattern is still alive: its last payment is no older than two
 *    steps plus STALE_GRACE_DAYS (bank exports arrive monthly).
 */

/** A payment to a merchant: one expense of the ledger. */
export type Payment = {
  transactionId: number
  /** Effective calendar date, 'YYYY-MM-DD'. */
  date: string
  /** Money spent, positive cents. */
  amountCents: number
  /** The importer's normalized merchant key ('' when the row has none). */
  merchantKey: string
  payee: string | null
  categoryId: number | null
  accountId: number
  /** null = joint. */
  paidByUserId: number | null
}

/** A recurring payment found in the payments. */
export type DetectedItem = {
  merchantKey: string
  /** Display name: the latest payment's payee. */
  payee: string
  cadence: RecurringCadence
  /** Typical amount: the median of the payments that form the pattern. */
  amountCents: number
  lastPaidDate: string
  /** One step after the last payment, rolled forward to today or later. */
  nextExpectedDate: string
  occurrences: number
  /** The latest category given to one of its payments. */
  categoryId: number | null
  accountId: number
  paidByUserId: number | null
}

export const MIN_OCCURRENCES = 3
export const DEFAULT_TOLERANCE_PCT = 15
/** Share of the gaps that must be exactly one step (the rest may skip one payment). */
export const REGULAR_SHARE = 0.75
/** Days a pattern stays alive beyond two missed steps: room for a monthly bank export. */
export const STALE_GRACE_DAYS = 31

export interface DetectionOptions {
  /** Today in the household's time zone. */
  today: string
  tolerancePct?: number
}

/** True when `amountCents` is within `tolerancePct`% of `typicalCents`. */
export function withinTolerance(amountCents: number, typicalCents: number, tolerancePct: number) {
  return Math.abs(amountCents - typicalCents) * 100 <= typicalCents * tolerancePct
}

/** Median in whole cents (the mean of the two middle values, rounded, for an even count). */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

/**
 * The cadence that dates (oldest first) follow, or null. Cadences are tried
 * shortest first; their step ranges never overlap, so at most one fits.
 */
export function cadenceOf(dates: string[]): RecurringCadence | null {
  if (dates.length < 2) return null
  for (const cadence of RECURRING_CADENCES) {
    const steps = dates.slice(1).map((date, index) => stepsBetween(dates[index], date, cadence))
    if (steps.some((count) => count === null)) continue
    const regular = steps.filter((count) => count === 1).length
    if (regular >= Math.ceil(steps.length * REGULAR_SHARE)) return cadence
  }
  return null
}

function isStale(lastDate: string, cadence: RecurringCadence, today: string) {
  return addDays(addCadence(lastDate, cadence, 2), STALE_GRACE_DAYS) < today
}

function byDate(a: Payment, b: Payment) {
  return a.date === b.date ? a.transactionId - b.transactionId : a.date < b.date ? -1 : 1
}

function detectOne(
  payments: Payment[],
  { today, tolerancePct = DEFAULT_TOLERANCE_PCT }: DetectionOptions
): DetectedItem | null {
  if (payments.length < MIN_OCCURRENCES) return null

  const typical = median(payments.slice(-3).map((payment) => payment.amountCents))
  const pattern = payments.filter((payment) =>
    withinTolerance(payment.amountCents, typical, tolerancePct)
  )
  if (pattern.length < MIN_OCCURRENCES) return null

  const cadence = cadenceOf(pattern.map((payment) => payment.date))
  const last = pattern[pattern.length - 1]
  if (cadence === null || isStale(last.date, cadence, today)) return null

  // The latest categorized payment (no `findLast`: the web compiler reads this file too).
  const categorized = [...pattern].reverse().find((payment) => payment.categoryId !== null)
  return {
    merchantKey: last.merchantKey,
    payee: last.payee?.trim() || last.merchantKey,
    cadence,
    amountCents: median(pattern.map((payment) => payment.amountCents)),
    lastPaidDate: last.date,
    nextExpectedDate: nextDueOnOrAfter(last.date, cadence, today),
    occurrences: pattern.length,
    categoryId: categorized?.categoryId ?? null,
    accountId: last.accountId,
    paidByUserId: last.paidByUserId,
  }
}

/** The recurring payments among `payments`, one per merchant key, by merchant key. */
export function detectRecurring(payments: Payment[], options: DetectionOptions): DetectedItem[] {
  const byMerchant = new Map<string, Payment[]>()
  for (const payment of payments) {
    if (payment.merchantKey === '' || payment.amountCents <= 0) continue
    const group = byMerchant.get(payment.merchantKey) ?? []
    group.push(payment)
    byMerchant.set(payment.merchantKey, group)
  }

  return [...byMerchant.keys()]
    .sort()
    .map((key) => detectOne(byMerchant.get(key)!.sort(byDate), options))
    .filter((item): item is DetectedItem => item !== null)
}
