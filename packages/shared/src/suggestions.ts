/**
 * Quick add's suggestions (`GET /transactions/suggestions`): the categories,
 * payees and transfer routes a person used lately, ranked by frequency and
 * recency, plus the last account they used. The API scores what is on the
 * server; the web adds what still waits in its offline outbox with the same
 * weights, so both halves rank in the same units.
 */

/** A use this many days old weighs half as much as one made today. */
export const RECENCY_HALF_LIFE_DAYS = 30

/** Rows read per source (the person's own, and the household's). */
export const SUGGESTION_ROWS = 100

const DAY_MS = 86_400_000

function dayIndex(date: string): number {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  return Math.round(Date.UTC(year, month - 1, day) / DAY_MS)
}

/** 1 for a use dated `today`, 0.5 a half-life earlier; future dates count as today. */
export function recencyWeight(date: string, today: string): number {
  const age = Math.max(0, dayIndex(today) - dayIndex(date))
  return Math.pow(0.5, age / RECENCY_HALF_LIFE_DAYS)
}

/** The key two spellings of one payee share: case, accents and spacing ignored. */
export function payeeKey(payee: string): string {
  return payee
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Scores go over the wire with four decimals. */
export function roundScore(score: number): number {
  return Math.round(score * 10_000) / 10_000
}

/** How much something was used (sum of recency weights) and when last. */
export interface ScoredUse {
  score: number
  /** 'YYYY-MM-DD' of the latest use. */
  lastDate: string
}

export interface CategorySuggestion extends ScoredUse {
  categoryId: number
}

export interface PayeeSuggestion extends ScoredUse {
  /** The newest spelling. */
  payee: string
}

export interface RouteSuggestion extends ScoredUse {
  fromAccountId: number
  toAccountId: number
}

/** The body of `GET /transactions/suggestions`, every list best first. */
export interface TransactionSuggestions {
  /** The day the scores were computed for (today in the household time zone). */
  asOf: string
  categories: { expense: CategorySuggestion[]; income: CategorySuggestion[] }
  payees: { expense: PayeeSuggestion[]; income: PayeeSuggestion[] }
  routes: RouteSuggestion[]
  /** The active account of the person's latest expense or income, or null. */
  lastAccountId: number | null
}
