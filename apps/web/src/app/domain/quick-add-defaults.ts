/**
 * Defaults for quick add, computed from the household's recent ledger rows.
 * Pure: no Angular. Every ranking mixes frequency and recency: each use adds
 * a weight that halves every {@link RECENCY_HALF_LIFE_DAYS} days, so a
 * category used three times last week beats one used five times in June.
 */
import { daysBetween, type IsoDate } from './month'
import { matchesSearch, normalizeForSearch } from './text'

export type EntryKind = 'expense' | 'income'
export type LedgerKind = EntryKind | 'transfer'

/** The fields of a ledger row the defaults read (a subset of the API's Transaction). */
export interface RecentEntry {
  id: number
  kind: LedgerKind
  date: IsoDate
  accountId: number
  /** Signed: money out is negative (a transfer's outgoing leg too). */
  amountCents: number
  categoryId: number | null
  payee: string | null
  transferId: number | null
  createdByUserId: number | null
}

export interface ActiveFlag {
  id: number
  isActive: boolean
}

export interface TransferPair {
  fromAccountId: number
  toAccountId: number
}

/** A use this many days old weighs half as much as one made today. */
export const RECENCY_HALF_LIFE_DAYS = 30

/** Tiles in the quick-add grid before the eighth one, "More". */
export const QUICK_CATEGORY_COUNT = 7

/** 1 for today, 0.5 a half-life ago; future dates count as today. */
export function recencyWeight(date: IsoDate, today: IsoDate): number {
  const age = Math.max(0, daysBetween(date, today))
  return Math.pow(0.5, age / RECENCY_HALF_LIFE_DAYS)
}

interface Score {
  score: number
  lastDate: IsoDate
  lastId: number
}

/** Adds one use to a running score, remembering the latest use for tie-breaks. */
function addUse(scores: Map<string, Score>, key: string, row: RecentEntry, today: IsoDate) {
  const current = scores.get(key) ?? { score: 0, lastDate: '', lastId: -Infinity }
  current.score += recencyWeight(row.date, today)
  if (row.date > current.lastDate || (row.date === current.lastDate && row.id > current.lastId)) {
    current.lastDate = row.date
    current.lastId = row.id
  }
  scores.set(key, current)
}

/** Higher score first, then the most recent use. */
function compareScores(a: Score, b: Score): number {
  return (
    b.score - a.score ||
    (a.lastDate < b.lastDate ? 1 : a.lastDate > b.lastDate ? -1 : 0) ||
    b.lastId - a.lastId
  )
}

/**
 * The categories for the quick-add grid: the candidates (the visible
 * categories of that kind, in their default order) ranked by use, and the
 * unused ones after them in their default order.
 */
export function rankCategories(
  recent: readonly RecentEntry[],
  kind: EntryKind,
  today: IsoDate,
  candidates: readonly { id: number }[],
  limit = QUICK_CATEGORY_COUNT
): number[] {
  const allowed = new Set(candidates.map((candidate) => candidate.id))
  const scores = new Map<string, Score>()
  for (const row of recent) {
    if (row.kind === kind && row.categoryId !== null && allowed.has(row.categoryId)) {
      addUse(scores, String(row.categoryId), row, today)
    }
  }
  const used = [...scores.entries()]
    .sort(([, a], [, b]) => compareScores(a, b))
    .map(([id]) => Number(id))
  const unused = candidates.map((candidate) => candidate.id).filter((id) => !scores.has(String(id)))
  return [...used, ...unused].slice(0, limit)
}

/**
 * The account quick add opens with, for one person: the one they used last
 * on this device (when still active), else the latest expense or income they
 * entered, else the first active account; null when there is none.
 */
export function defaultAccountFor(
  userId: number,
  recent: readonly RecentEntry[],
  accounts: readonly ActiveFlag[],
  stored: number | null
): number | null {
  const active = new Set(accounts.filter((account) => account.isActive).map((account) => account.id))
  if (stored !== null && active.has(stored)) {
    return stored
  }
  const latest = recent
    .filter((row) => row.kind !== 'transfer' && row.createdByUserId === userId)
    .filter((row) => active.has(row.accountId))
    .reduce<RecentEntry | null>(
      (best, row) =>
        best === null || row.date > best.date || (row.date === best.date && row.id > best.id)
          ? row
          : best,
      null
    )
  if (latest) {
    return latest.accountId
  }
  return accounts.find((account) => account.isActive)?.id ?? null
}

/**
 * The most used transfer routes ("→ Savings"), read from transfer legs: the
 * negative leg is the source, the positive one the destination. Routes that
 * touch an inactive account are skipped.
 */
export function transferPresets(
  recent: readonly RecentEntry[],
  accounts: readonly ActiveFlag[],
  today: IsoDate,
  limit = 3
): TransferPair[] {
  const active = new Set(accounts.filter((account) => account.isActive).map((account) => account.id))
  const byTransfer = new Map<number, RecentEntry[]>()
  for (const row of recent) {
    if (row.kind === 'transfer' && row.transferId !== null) {
      byTransfer.set(row.transferId, [...(byTransfer.get(row.transferId) ?? []), row])
    }
  }
  const scores = new Map<string, Score>()
  for (const legs of byTransfer.values()) {
    const from = legs.find((leg) => leg.amountCents < 0)
    const to = legs.find((leg) => leg.amountCents > 0)
    if (!from || !to || !active.has(from.accountId) || !active.has(to.accountId)) {
      continue
    }
    addUse(scores, `${from.accountId}>${to.accountId}`, from, today)
  }
  return [...scores.entries()]
    .sort(([, a], [, b]) => compareScores(a, b))
    .slice(0, limit)
    .map(([key]) => {
      const [fromAccountId, toAccountId] = key.split('>').map(Number) as [number, number]
      return { fromAccountId, toAccountId }
    })
}

/**
 * The transfer quick add opens with: the most used route, else from the
 * default account to the first savings account (or the next active one).
 */
export function defaultTransferPair(
  accounts: readonly (ActiveFlag & { kind: string })[],
  presets: readonly TransferPair[],
  defaultAccountId: number | null
): { fromAccountId: number | null; toAccountId: number | null } {
  const top = presets[0]
  if (top) {
    return { ...top }
  }
  const active = accounts.filter((account) => account.isActive)
  const fromAccountId = defaultAccountId ?? active[0]?.id ?? null
  const others = active.filter((account) => account.id !== fromAccountId)
  const toAccountId =
    others.find((account) => account.kind === 'savings')?.id ?? others[0]?.id ?? null
  return { fromAccountId, toAccountId }
}

/**
 * Recent payees for the merchant field: ranked by use, matched against what
 * was typed (accents and case ignored), without the exact text already typed.
 * The spelling shown is the first one listed (the API lists newest first).
 */
export function payeeSuggestions(
  recent: readonly RecentEntry[],
  kind: EntryKind,
  query: string,
  today: IsoDate,
  limit = 4
): string[] {
  const typed = normalizeForSearch(query)
  const scores = new Map<string, Score>()
  const spelling = new Map<string, string>()
  for (const row of recent) {
    const payee = row.payee?.trim()
    if (row.kind !== kind || !payee) {
      continue
    }
    const key = normalizeForSearch(payee)
    addUse(scores, key, row, today)
    if (!spelling.has(key)) {
      spelling.set(key, payee)
    }
  }
  return [...scores.entries()]
    .filter(([key]) => key !== typed && matchesSearch(key, query))
    .sort(([, a], [, b]) => compareScores(a, b))
    .slice(0, limit)
    .map(([key]) => spelling.get(key) ?? key)
}
