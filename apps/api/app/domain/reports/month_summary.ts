import { monthOf, monthRange, type Month } from '#domain/calendar/month'
import { flowAmount, flowOf, type Flow, type Posting } from '#domain/ledger/posting'

/**
 * Where the money went in one calendar month. Pure: it receives postings
 * (already masked for the reader, see app/domain/ledger/privacy.ts) and
 * never touches the database.
 *
 * Sign convention of every `*Cents` here: positive on its own side, so
 * `expenseCents` is money spent (net of refunds) and `incomeCents` money
 * received. Transfers between own accounts are neither.
 */

/** How a line is keyed: a real category/group, nothing yet, or hidden. */
export type CategoryBucket = 'category' | 'uncategorized' | 'private'
export type GroupBucket = 'group' | 'uncategorized' | 'private'
export type PersonBucket = 'member' | 'joint'

export type CategoryLine = {
  bucket: CategoryBucket
  categoryId: number | null
  groupId: number | null
  kind: Flow
  amountCents: number
  /** Transactions that contributed (a split counts once per line). */
  count: number
}

export type GroupLine = {
  bucket: GroupBucket
  groupId: number | null
  kind: Flow
  amountCents: number
  count: number
}

export type PersonLine = {
  bucket: PersonBucket
  /** null for the joint bucket (paid by "both of us"). */
  userId: number | null
  incomeCents: number
  expenseCents: number
  netCents: number
}

export type MonthSummary = {
  month: Month
  from: string
  to: string
  incomeCents: number
  expenseCents: number
  /** income - expense. */
  netCents: number
  byGroup: GroupLine[]
  byCategory: CategoryLine[]
  byPerson: PersonLine[]
  /** Money still to categorize, regardless of direction (sum of absolute amounts). */
  uncategorizedCents: number
  /** Net amount still pending, expense-positive (a pending purchase adds to it). */
  pendingCents: number
  /** Distinct transactions counted (transfers excluded). */
  transactionCount: number
}

export function excludeTransfers(postings: Posting[]): Posting[] {
  return postings.filter((posting) => posting.kind !== 'transfer')
}

function categoryBucketOf(posting: Posting): CategoryBucket {
  if (posting.hidden) return 'private'
  return posting.categoryId === null ? 'uncategorized' : 'category'
}

const GROUP_BUCKET: Record<CategoryBucket, GroupBucket> = {
  category: 'group',
  uncategorized: 'uncategorized',
  private: 'private',
}

type Accumulator<Line> = { line: Line; transactions: Set<number> }

function accumulate<Line extends { amountCents: number; count: number }>(
  lines: Map<string, Accumulator<Line>>,
  key: string,
  create: () => Line,
  posting: Posting,
  amountCents: number
) {
  let entry = lines.get(key)
  if (!entry) {
    entry = { line: create(), transactions: new Set() }
    lines.set(key, entry)
  }
  entry.line.amountCents += amountCents
  entry.transactions.add(posting.transactionId)
  entry.line.count = entry.transactions.size
}

function compareIds(a: number | null, b: number | null) {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a - b
}

/** Expense lines first, then the biggest amount, then a stable id order. */
export function byKindThenAmount<Line extends { kind: Flow; amountCents: number }>(
  idOf: (line: Line) => number | null
) {
  return (a: Line, b: Line) => {
    if (a.kind !== b.kind) return a.kind === 'expense' ? -1 : 1
    if (a.amountCents !== b.amountCents) return b.amountCents - a.amountCents
    return compareIds(idOf(a), idOf(b))
  }
}

export function summarizeMonth(postings: Posting[], month: Month): MonthSummary {
  const { from, to } = monthRange(month)
  const inMonth = excludeTransfers(postings).filter((posting) => monthOf(posting.date) === month)

  let incomeCents = 0
  let expenseCents = 0
  let uncategorizedCents = 0
  let pendingCents = 0
  const transactions = new Set<number>()
  const categories = new Map<string, Accumulator<CategoryLine>>()
  const groups = new Map<string, Accumulator<GroupLine>>()
  const people = new Map<number | null, PersonLine>()

  for (const posting of inMonth) {
    const kind = flowOf(posting) ?? 'expense'
    const amountCents = flowAmount(posting, kind)
    transactions.add(posting.transactionId)

    if (kind === 'expense') expenseCents += amountCents
    else incomeCents += amountCents
    if (posting.status === 'pending') pendingCents -= posting.amountCents

    const bucket = categoryBucketOf(posting)
    if (bucket === 'uncategorized') uncategorizedCents += Math.abs(posting.amountCents)

    accumulate(
      categories,
      `${bucket}:${posting.categoryId}:${kind}`,
      () => ({
        bucket,
        categoryId: posting.categoryId,
        groupId: posting.groupId,
        kind,
        amountCents: 0,
        count: 0,
      }),
      posting,
      amountCents
    )

    const groupBucket = GROUP_BUCKET[bucket]
    accumulate(
      groups,
      `${groupBucket}:${posting.groupId}:${kind}`,
      () => ({ bucket: groupBucket, groupId: posting.groupId, kind, amountCents: 0, count: 0 }),
      posting,
      amountCents
    )

    const person = people.get(posting.paidByUserId) ?? {
      bucket: posting.paidByUserId === null ? ('joint' as const) : ('member' as const),
      userId: posting.paidByUserId,
      incomeCents: 0,
      expenseCents: 0,
      netCents: 0,
    }
    if (kind === 'expense') person.expenseCents += amountCents
    else person.incomeCents += amountCents
    person.netCents = person.incomeCents - person.expenseCents
    people.set(posting.paidByUserId, person)
  }

  return {
    month,
    from,
    to,
    incomeCents,
    expenseCents,
    netCents: incomeCents - expenseCents,
    byGroup: [...groups.values()]
      .map((entry) => entry.line)
      .sort(byKindThenAmount((line) => line.groupId)),
    byCategory: [...categories.values()]
      .map((entry) => entry.line)
      .sort(byKindThenAmount((line) => line.categoryId)),
    byPerson: [...people.values()].sort((a, b) => compareIds(a.userId, b.userId)),
    uncategorizedCents,
    pendingCents,
    transactionCount: transactions.size,
  }
}
