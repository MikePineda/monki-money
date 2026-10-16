import {
  normalizeForSearch,
  recencyWeight,
  roundScore,
  type CategorySuggestion,
  type PayeeSuggestion,
  type RouteSuggestion,
  type ScoredUse,
  type TransactionKind,
  type TransactionSuggestions,
} from '@monkimoney/shared'

/** Categories and payees offered per kind; transfer routes offered. */
export const SUGGESTION_LIMITS = { categories: 20, payees: 20, routes: 5 } as const

/** The fields of a ledger row the suggestions read, masked for the reader. */
export type SuggestionRow = {
  id: number
  kind: TransactionKind
  /** 'YYYY-MM-DD'. */
  date: string
  accountId: number
  /** Signed: a transfer's outgoing leg is negative. */
  amountCents: number
  categoryId: number | null
  payee: string | null
  transferId: number | null
  /** A partner's private row: it says nothing (no category, payee or route). */
  hidden: boolean
}

export type SuggestionOptions = {
  /** Today in the household time zone: uses weigh by their age from it. */
  today: string
  /** Routes touching any other account are not offered. */
  activeAccountIds: ReadonlySet<number>
  lastAccountId: number | null
}

type Score = ScoredUse & { lastId: number }

/** Adds one use: its recency weight, and the latest use for tie-breaks. */
function addUse(scores: Map<string, Score>, key: string, row: SuggestionRow, today: string) {
  const current = scores.get(key) ?? { score: 0, lastDate: '', lastId: -Infinity }
  current.score += recencyWeight(row.date, today)
  if (row.date > current.lastDate || (row.date === current.lastDate && row.id > current.lastId)) {
    current.lastDate = row.date
    current.lastId = row.id
  }
  scores.set(key, current)
}

/** Most used first, then the latest use (the same order the web merges with). */
function ranked(scores: Map<string, Score>, limit: number): [string, ScoredUse][] {
  return [...scores.entries()]
    .sort(
      ([, a], [, b]) =>
        b.score - a.score ||
        (a.lastDate < b.lastDate ? 1 : a.lastDate > b.lastDate ? -1 : 0) ||
        b.lastId - a.lastId
    )
    .slice(0, limit)
    .map(([key, score]) => [key, { score: roundScore(score.score), lastDate: score.lastDate }])
}

function categoriesOf(rows: SuggestionRow[], kind: 'expense' | 'income', today: string) {
  const scores = new Map<string, Score>()
  for (const row of rows) {
    if (row.kind === kind && row.categoryId !== null)
      addUse(scores, String(row.categoryId), row, today)
  }
  return ranked(scores, SUGGESTION_LIMITS.categories).map(([id, use]): CategorySuggestion => ({
    categoryId: Number(id),
    ...use,
  }))
}

/** Payees by key (case and accents ignored), spelled as their latest use. */
function payeesOf(rows: SuggestionRow[], kind: 'expense' | 'income', today: string) {
  const scores = new Map<string, Score>()
  const spelling = new Map<string, string>()
  for (const row of rows) {
    const payee = row.payee?.trim()
    if (row.kind !== kind || !payee) continue
    const key = normalizeForSearch(payee)
    const before = scores.get(key)?.lastId
    addUse(scores, key, row, today)
    if (scores.get(key)?.lastId !== before) spelling.set(key, payee)
  }
  return ranked(scores, SUGGESTION_LIMITS.payees).map(([key, use]): PayeeSuggestion => ({
    payee: spelling.get(key) ?? key,
    ...use,
  }))
}

/** Transfer routes from their legs: the negative leg is the source, the positive one the destination. */
function routesOf(rows: SuggestionRow[], options: SuggestionOptions) {
  const legs = new Map<number, SuggestionRow[]>()
  for (const row of rows) {
    if (row.kind === 'transfer' && row.transferId !== null) {
      legs.set(row.transferId, [...(legs.get(row.transferId) ?? []), row])
    }
  }
  const scores = new Map<string, Score>()
  for (const pair of legs.values()) {
    const from = pair.find((leg) => leg.amountCents < 0)
    const to = pair.find((leg) => leg.amountCents > 0)
    if (
      !from ||
      !to ||
      !options.activeAccountIds.has(from.accountId) ||
      !options.activeAccountIds.has(to.accountId)
    ) {
      continue
    }
    addUse(scores, `${from.accountId}>${to.accountId}`, from, options.today)
  }
  return ranked(scores, SUGGESTION_LIMITS.routes).map(([key, use]): RouteSuggestion => {
    const [fromAccountId, toAccountId] = key.split('>').map(Number) as [number, number]
    return { fromAccountId, toAccountId, ...use }
  })
}

/**
 * What quick add offers a person: categories and payees per kind and
 * transfer routes, each ranked by use weighted by recency (a use halves
 * every 30 days, `@monkimoney/shared` `recencyWeight`), plus the last
 * account they used. Pure; the rows arrive masked for the reader and
 * hidden ones count for nothing.
 */
export function suggestionsFrom(
  rows: SuggestionRow[],
  options: SuggestionOptions
): TransactionSuggestions {
  const visible = rows.filter((row) => !row.hidden)
  return {
    asOf: options.today,
    categories: {
      expense: categoriesOf(visible, 'expense', options.today),
      income: categoriesOf(visible, 'income', options.today),
    },
    payees: {
      expense: payeesOf(visible, 'expense', options.today),
      income: payeesOf(visible, 'income', options.today),
    },
    routes: routesOf(visible, options),
    lastAccountId: options.lastAccountId,
  }
}
