import { addMonths, monthOf, monthsBetween, type Month } from '#domain/calendar/month'
import { flowAmount, flowOf, type Posting } from '#domain/ledger/posting'
import {
  summarizePostings,
  type CategoryLine,
  type PersonLine,
} from '#domain/reports/month_summary'

/**
 * Per-tag totals ("how much did the trip cost?"). Pure: it receives
 * postings already masked for the reader (a partner's private posting has
 * no tags, see app/domain/ledger/privacy.ts) and never touches the
 * database. Split lines carry their parent's tags.
 *
 * Same sign convention as the month summary: amounts are positive on their
 * own side. Transfers never count as spending or income; a tagged transfer
 * leg that lands in a `savings` account is money set aside for the tag.
 */

/** Calendar dates, inclusive; either end may be open. */
export type TagRange = { from?: string; to?: string }

export type TagTotals = {
  tag: string
  /** Tagged movements: a split counts once, a transfer (two legs) once. */
  count: number
  /** Spent, net of refunds. */
  expenseCents: number
  incomeCents: number
  /** income - expense. */
  netCents: number
  /** Tagged transfers into a savings account. */
  setAsideCents: number
  /** First and last date the tag was used (null when nothing falls in the range). */
  firstDate: string | null
  lastDate: string | null
}

export type TagMonth = {
  month: Month
  expenseCents: number
  incomeCents: number
  setAsideCents: number
}

export type TagDetail = TagTotals & {
  byCategory: CategoryLine[]
  /** Every calendar month from the first use to the last one, quiet months included. */
  byMonth: TagMonth[]
  /** Who paid; null payer = the joint bucket. */
  byPerson: PersonLine[]
}

function inRange(posting: Posting, range: TagRange): boolean {
  if (range.from && posting.date < range.from) return false
  if (range.to && posting.date > range.to) return false
  return true
}

/** An incoming transfer leg on a savings account: money put aside. */
function isSetAside(posting: Posting): boolean {
  return posting.kind === 'transfer' && posting.accountKind === 'savings' && posting.amountCents > 0
}

/**
 * A key per movement: the transaction (all its split lines), or the
 * transfer, which shows up as its incoming leg only (each transfer has
 * exactly one).
 */
function movementKey(posting: Posting): number | null {
  if (posting.kind !== 'transfer') return posting.transactionId
  return posting.amountCents > 0 ? posting.transactionId : null
}

function totalsOf(tag: string, postings: Posting[]): TagTotals {
  const movements = new Set<number>()
  let expenseCents = 0
  let incomeCents = 0
  let setAsideCents = 0
  let firstDate: string | null = null
  let lastDate: string | null = null

  for (const posting of postings) {
    const key = movementKey(posting)
    if (key !== null) movements.add(key)
    if (firstDate === null || posting.date < firstDate) firstDate = posting.date
    if (lastDate === null || posting.date > lastDate) lastDate = posting.date

    if (isSetAside(posting)) setAsideCents += posting.amountCents
    const flow = flowOf(posting)
    if (flow === 'expense') expenseCents += flowAmount(posting, flow)
    else if (flow === 'income') incomeCents += flowAmount(posting, flow)
  }

  return {
    tag,
    count: movements.size,
    expenseCents,
    incomeCents,
    netCents: incomeCents - expenseCents,
    setAsideCents,
    firstDate,
    lastDate,
  }
}

/** The postings of each tag, in the order they come. */
function groupByTag(postings: Posting[]): Map<string, Posting[]> {
  const tags = new Map<string, Posting[]>()
  for (const posting of postings) {
    for (const tag of new Set(posting.tags)) {
      const list = tags.get(tag)
      if (list) list.push(posting)
      else tags.set(tag, [posting])
    }
  }
  return tags
}

/** Most recently used first; ties by name, so the order is stable. */
function byLastUse(a: TagTotals, b: TagTotals): number {
  const [lastA, lastB] = [a.lastDate ?? '', b.lastDate ?? '']
  if (lastA !== lastB) return lastA < lastB ? 1 : -1
  if (a.tag === b.tag) return 0
  return a.tag < b.tag ? -1 : 1
}

/** Every tag used within `range`, with its totals, most recently used first. */
export function tagTotals(postings: Posting[], range: TagRange = {}): TagTotals[] {
  const scoped = postings.filter((posting) => inRange(posting, range))
  return [...groupByTag(scoped).entries()]
    .map(([tag, tagged]) => totalsOf(tag, tagged))
    .sort(byLastUse)
}

function monthsOf(postings: Posting[], first: string, last: string): TagMonth[] {
  const start = monthOf(first)
  const months = Array.from({ length: monthsBetween(start, monthOf(last)) + 1 }, (_, index) => ({
    month: addMonths(start, index),
    expenseCents: 0,
    incomeCents: 0,
    setAsideCents: 0,
  }))

  for (const posting of postings) {
    const line = months[monthsBetween(start, monthOf(posting.date))]
    if (isSetAside(posting)) line.setAsideCents += posting.amountCents
    const flow = flowOf(posting)
    if (flow === 'expense') line.expenseCents += flowAmount(posting, flow)
    else if (flow === 'income') line.incomeCents += flowAmount(posting, flow)
  }
  return months
}

/**
 * One tag's totals within `range` and where its money went (by category,
 * by calendar month, by person). Null when no posting carries the tag at
 * all, whatever the range: the tag does not exist for this reader. A tag
 * that exists but has nothing in the range answers zeros.
 */
export function tagDetail(
  postings: Posting[],
  tag: string,
  range: TagRange = {}
): TagDetail | null {
  const tagged = postings.filter((posting) => posting.tags.includes(tag))
  if (tagged.length === 0) return null

  const scoped = tagged.filter((posting) => inRange(posting, range))
  const totals = totalsOf(tag, scoped)
  const lines = summarizePostings(scoped)

  return {
    ...totals,
    byCategory: lines.byCategory,
    byMonth:
      totals.firstDate && totals.lastDate
        ? monthsOf(scoped, totals.firstDate, totals.lastDate)
        : [],
    byPerson: lines.byPerson,
  }
}
