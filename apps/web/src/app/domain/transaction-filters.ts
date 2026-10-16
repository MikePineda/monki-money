/**
 * Filters of the transactions list and their `GET /transactions` query.
 * Pure: no Angular. A month applies unless a tag spans every month (a trip
 * tagged across several); the rest narrow it down.
 */
import type { YearMonth } from './month'

export type CategoryFilter = { type: 'category'; id: number } | { type: 'uncategorized' }

export interface TransactionFilters {
  /** The month on screen; null = every month (only ever set alongside a tag). */
  month: YearMonth | null
  accountId: number | null
  /** Who paid; the API cannot filter joint rows on their own. */
  paidByUserId: number | null
  category: CategoryFilter | null
  q: string
  /** Only rows carrying this exact tag. */
  tag: string | null
}

/** The API's default and the size of every "load more" step. */
export const TRANSACTIONS_PER_PAGE = 50

export interface TransactionListQuery {
  month?: YearMonth
  accountId?: number[]
  categoryId?: number[]
  uncategorized?: true
  paidByUserId?: number
  q?: string
  tag?: string
  page: number
  perPage: number
}

export function initialFilters(month: YearMonth | null): TransactionFilters {
  return { month, accountId: null, paidByUserId: null, category: null, q: '', tag: null }
}

export function toListQuery(
  filters: TransactionFilters,
  page: number,
  perPage = TRANSACTIONS_PER_PAGE
): TransactionListQuery {
  const query: TransactionListQuery =
    filters.month === null ? { page, perPage } : { month: filters.month, page, perPage }
  if (filters.accountId !== null) {
    query.accountId = [filters.accountId]
  }
  if (filters.paidByUserId !== null) {
    query.paidByUserId = filters.paidByUserId
  }
  if (filters.category?.type === 'category') {
    query.categoryId = [filters.category.id]
  } else if (filters.category?.type === 'uncategorized') {
    query.uncategorized = true
  }
  const q = filters.q.trim()
  if (q) {
    query.q = q
  }
  if (filters.tag !== null) {
    query.tag = filters.tag
  }
  return query
}

/** True when anything besides the month narrows the list. */
export function hasNarrowingFilters(filters: TransactionFilters): boolean {
  return (
    filters.accountId !== null ||
    filters.paidByUserId !== null ||
    filters.category !== null ||
    filters.q.trim() !== '' ||
    filters.tag !== null
  )
}

/** Drops every filter but the month. */
export function clearFilters(filters: TransactionFilters): TransactionFilters {
  return initialFilters(filters.month)
}
