import type { RecurringCadence } from '@monkimoney/shared'
import { RECURRING_CADENCES } from '@monkimoney/shared'
import { addDays } from '#domain/importing/iso_days'
import { addCadence, nextDueOnOrAfter, stepsBetween } from '#domain/recurring/cadence'

/**
 * Finds recurring payments (rent, phone, gym, subscriptions) in a
 * household's spending. Pure: it receives the payments and "today" and
 * never reads the database or the clock.
 *
 * Per merchant key, the payments are first split into amount bands:
 * sorted by amount, a payment joins the band of the one before while it is
 * within the tolerance of it, so two plans at one merchant (two phone
 * lines, $65 and $45) are two bands while a price creeping up stays one.
 * Then per band:
 * 1. payments of the same day are one payment (their sum): both partners
 *    paying the same gym, or a bill split over two cards;
 * 2. the typical amount is the median of the three latest payments, and
 *    only payments within the tolerance of it form the pattern (a one-off
 *    purchase at the same merchant, or an old price, is left out);
 * 3. for each cadence, the latest unbroken run of those payments: walking
 *    back from the newest one while each gap is one step or two (one
 *    missed payment). A gap that fits no step ends the run, so a
 *    duplicate charge or a three-month pause long ago does not hide what
 *    came after it. The run needs MIN_OCCURRENCES payments and at least
 *    REGULAR_SHARE of its gaps exactly one step. A yearly bill may instead
 *    be two payments one year apart (MIN_YEARLY_OCCURRENCES): found with
 *    low confidence (`confidenceOf`) until a third payment comes;
 * 4. the amounts must be steady: among the merchant's comparable payments
 *    of the window (within COMPARABLE_PCT of the typical amount), at least
 *    STEADY_SHARE are within the tolerance. Weekly groceries of varying
 *    amounts do not qualify, while an old price before the run (a steady
 *    block of its own), a one-off purchase far from the bill's amount or
 *    another band of the merchant that is a pattern of its own (the other
 *    phone line) does not count against it;
 * 5. the run is still alive: its last payment is no older than two steps
 *    plus STALE_GRACE_DAYS (bank exports arrive monthly); one step plus
 *    the grace for a yearly bill seen twice.
 *
 * Every cadence reads the last WINDOW_DAYS; yearly reads YEARLY_WINDOW_DAYS
 * (three yearly payments, the latest up to a year old: three years).
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
  /** The key of the payee alone (what an item typed by hand is keyed by), '' when none. */
  payeeKey: string
  payee: string | null
  categoryId: number | null
  accountId: number
  /** null = joint. */
  paidByUserId: number | null
}

/** A recurring payment found in the payments. */
export type DetectedItem = {
  merchantKey: string
  /** The payee keys of its payments: an item typed by hand under one of them is this one. */
  payeeKeys: string[]
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
  /** Whoever paid at least MAJORITY_SHARE of the run; null (joint) when it is mixed. */
  paidByUserId: number | null
}

export const MIN_OCCURRENCES = 3
/** A yearly bill seen twice, one year apart, is found too (with low confidence). */
export const MIN_YEARLY_OCCURRENCES = 2
export const DEFAULT_TOLERANCE_PCT = 15
/** Share of the gaps that must be exactly one step (the rest may skip one payment). */
export const REGULAR_SHARE = 0.75
/** Days a pattern stays alive beyond two missed steps: room for a monthly bank export. */
export const STALE_GRACE_DAYS = 31
/** History every cadence reads, in days before today. */
export const WINDOW_DAYS = 365
/**
 * History yearly payments read: three of them span two years, and the third
 * may be up to a year old, so three years plus a month of slack.
 */
export const YEARLY_WINDOW_DAYS = 3 * 365 + 35
/** Payments this close to the typical amount are the same kind of payment (the steadiness check). */
export const COMPARABLE_PCT = 50
/** Share of the comparable payments around the run that must be within the tolerance. */
export const STEADY_SHARE = 0.8
/** Share of a run one person must have paid to be its payer. */
export const MAJORITY_SHARE = 0.75

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

/** True when at least REGULAR_SHARE of the gaps between `dates` are exactly one step. */
function regular(dates: string[], cadence: RecurringCadence): boolean {
  const steps = dates.slice(1).map((date, index) => stepsBetween(dates[index], date, cadence))
  if (steps.some((count) => count === null)) return false
  const single = steps.filter((count) => count === 1).length
  return single >= Math.ceil(steps.length * REGULAR_SHARE)
}

/** Index of the first date of the unbroken run that ends with the newest date. */
function unbrokenStart(dates: string[], cadence: RecurringCadence): number {
  let start = dates.length - 1
  while (start > 0 && stepsBetween(dates[start - 1], dates[start], cadence) !== null) start--
  return start
}

/**
 * The latest unbroken run of `dates` (oldest first) for `cadence`: from the
 * newest date back while each gap is one or two steps, then trimmed from
 * its oldest end until it is regular. Empty when nothing qualifies.
 */
export function latestRun(
  dates: string[],
  cadence: RecurringCadence,
  minOccurrences = MIN_OCCURRENCES
): string[] {
  if (dates.length === 0) return []
  for (let first = unbrokenStart(dates, cadence); dates.length - first >= minOccurrences; first++) {
    const run = dates.slice(first)
    if (regular(run, cadence)) return run
  }
  return []
}

/**
 * The cadence the latest run of `dates` (oldest first) follows, or null.
 * Cadences are tried shortest first; their step ranges never overlap.
 */
export function cadenceOf(dates: string[]): RecurringCadence | null {
  return RECURRING_CADENCES.find((cadence) => latestRun(dates, cadence).length > 0) ?? null
}

function isStale(lastDate: string, cadence: RecurringCadence, today: string, steps = 2) {
  return addDays(addCadence(lastDate, cadence, steps), STALE_GRACE_DAYS) < today
}

/** How sure detection is of an item: `low` for a detected yearly bill seen only twice. */
export type DetectionConfidence = 'high' | 'low'

export function confidenceOf(item: {
  source: 'detected' | 'manual'
  occurrences: number
}): DetectionConfidence {
  return item.source === 'detected' && item.occurrences < MIN_OCCURRENCES ? 'low' : 'high'
}

function byDate(a: Payment, b: Payment) {
  return a.date === b.date ? a.transactionId - b.transactionId : a.date < b.date ? -1 : 1
}

/** One payment per day: summed, described by the day's latest payment, joint when two people paid. */
type DayPayment = Payment & { payeeKeys: string[] }

function collapseSameDay(payments: Payment[]): DayPayment[] {
  const days: DayPayment[] = []
  for (const payment of payments) {
    const day = days.at(-1)
    if (day && day.date === payment.date) {
      day.amountCents += payment.amountCents
      if (day.paidByUserId !== payment.paidByUserId) day.paidByUserId = null
      day.payeeKeys = [...new Set([...day.payeeKeys, payment.payeeKey])]
      Object.assign(day, {
        transactionId: payment.transactionId,
        payee: payment.payee ?? day.payee,
        categoryId: payment.categoryId ?? day.categoryId,
        accountId: payment.accountId,
      })
    } else {
      days.push({ ...payment, payeeKeys: [payment.payeeKey] })
    }
  }
  return days
}

/** Whoever paid at least MAJORITY_SHARE of `run`, else null (joint). */
function payerOf(run: DayPayment[]): number | null {
  const counts = new Map<number | null, number>()
  for (const day of run) counts.set(day.paidByUserId, (counts.get(day.paidByUserId) ?? 0) + 1)
  for (const [payer, count] of counts) {
    if (count >= Math.ceil(run.length * MAJORITY_SHARE)) return payer
  }
  return null
}

/** Amounts are steady around the run: few comparable payments off the typical amount. */
function steady(
  days: DayPayment[],
  runStart: string,
  since: string,
  typical: number,
  tolerancePct: number
): boolean {
  const comparable = days.filter(
    (day) => day.date >= since && withinTolerance(day.amountCents, typical, COMPARABLE_PCT)
  )
  // An old price before the run is a steady block of its own, not noise.
  const before = comparable.filter((day) => day.date < runStart)
  const oldPrice =
    before.length >= 2 &&
    before.every((day) =>
      withinTolerance(day.amountCents, median(before.map((b) => b.amountCents)), tolerancePct)
    )
  const around = oldPrice ? comparable.filter((day) => day.date >= runStart) : comparable
  const within = around.filter((day) => withinTolerance(day.amountCents, typical, tolerancePct))
  // Rounded down: with four payments, one off the typical amount is still steady.
  return within.length >= Math.floor(around.length * STEADY_SHARE)
}

/**
 * A merchant's payments split by amount: sorted by amount, each joins the
 * band of the one before while within `tolerancePct` of it. Each band is
 * oldest first.
 */
export function amountBands(payments: Payment[], tolerancePct: number): Payment[][] {
  const bands: Payment[][] = []
  const byAmount = [...payments].sort((a, b) => a.amountCents - b.amountCents || byDate(a, b))
  for (const payment of byAmount) {
    const band = bands.at(-1)
    const previous = band?.at(-1)
    if (
      band &&
      previous &&
      withinTolerance(payment.amountCents, previous.amountCents, tolerancePct)
    ) {
      band.push(payment)
    } else {
      bands.push([payment])
    }
  }
  return bands.map((band) => band.sort(byDate))
}

/** A band's pattern before the steadiness check, which needs the merchant's other bands. */
type Candidate = {
  days: DayPayment[]
  run: DayPayment[]
  cadence: RecurringCadence
  typical: number
  runStart: string
  since: string
}

function candidateOf(days: DayPayment[], today: string, tolerancePct: number): Candidate | null {
  if (days.length < MIN_YEARLY_OCCURRENCES) return null
  const typical = median(days.slice(-3).map((day) => day.amountCents))
  const pattern = days.filter((day) => withinTolerance(day.amountCents, typical, tolerancePct))

  const sinceOf = (cadence: RecurringCadence) =>
    addDays(today, -(cadence === 'yearly' ? YEARLY_WINDOW_DAYS : WINDOW_DAYS))
  const found = (cadence: RecurringCadence, minOccurrences: number) => {
    const since = sinceOf(cadence)
    const candidates = pattern.filter((day) => day.date >= since)
    const candidateDates = candidates.map((day) => day.date)
    const dates = latestRun(candidateDates, cadence, minOccurrences)
    if (dates.length === 0) return undefined
    const run = candidates.slice(candidates.length - dates.length)
    // A yearly bill seen twice must be paid again within a step (plus the grace).
    const staleAfter = dates.length < MIN_OCCURRENCES ? 1 : 2
    if (isStale(run[run.length - 1].date, cadence, today, staleAfter)) return null
    const runStart = candidateDates[unbrokenStart(candidateDates, cadence)]
    return { days, run, cadence, typical, runStart, since }
  }

  for (const cadence of RECURRING_CADENCES) {
    const candidate = found(cadence, MIN_OCCURRENCES)
    if (candidate !== undefined) return candidate
  }
  return found('yearly', MIN_YEARLY_OCCURRENCES) ?? null
}

function itemOf(run: DayPayment[], cadence: RecurringCadence, today: string): DetectedItem {
  const last = run[run.length - 1]
  // The latest categorized payment (no `findLast`: the web compiler reads this file too).
  const categorized = [...run].reverse().find((day) => day.categoryId !== null)
  return {
    merchantKey: last.merchantKey,
    payeeKeys: [...new Set(run.flatMap((day) => day.payeeKeys))].filter(Boolean).sort(),
    payee: last.payee?.trim() || last.merchantKey,
    cadence,
    amountCents: median(run.map((day) => day.amountCents)),
    lastPaidDate: last.date,
    nextExpectedDate: nextDueOnOrAfter(last.date, cadence, today),
    occurrences: run.length,
    categoryId: categorized?.categoryId ?? null,
    accountId: last.accountId,
    paidByUserId: payerOf(run),
  }
}

/** The recurring payments of one merchant: one per amount band that forms a pattern. */
function detectMerchant(
  payments: Payment[],
  { today, tolerancePct = DEFAULT_TOLERANCE_PCT }: DetectionOptions
): DetectedItem[] {
  const bands = amountBands(payments, tolerancePct).map(collapseSameDay)
  const candidates = bands.map((days) => candidateOf(days, today, tolerancePct))

  const items: DetectedItem[] = []
  candidates.forEach((candidate, index) => {
    if (!candidate) return
    // Steady against the merchant's payments, but another band's own pattern is not noise.
    const others = bands.flatMap((days, other) =>
      other === index || candidates[other] ? [] : days
    )
    const days = [...candidate.days, ...others].sort(byDate)
    if (!steady(days, candidate.runStart, candidate.since, candidate.typical, tolerancePct)) return
    items.push(itemOf(candidate.run, candidate.cadence, today))
  })
  return items
}

/**
 * The recurring payments among `payments`: by merchant key, then by
 * amount (several per merchant when it has several bills).
 */
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
    .flatMap((key) =>
      detectMerchant(byMerchant.get(key)!, options).sort((a, b) => a.amountCents - b.amountCents)
    )
}
