import type { Category, CategoryTree, Transaction } from '../app/core/api/api-types'
import type { MonthReport, TrendReport } from '../app/core/ledger/reports.api'
import { addMonths, type YearMonth } from '../app/domain/month'

/** Synthetic ledger objects for specs (never real people or merchants). */

let nextTransactionId = 1000

export function aTransaction(overrides: Partial<Transaction> = {}): Transaction {
  const id = overrides.id ?? nextTransactionId++
  return {
    id,
    accountId: 1,
    kind: 'expense',
    date: '2026-10-15',
    bankDate: null,
    amountCents: -4250,
    currencyCode: 'AUD',
    payee: 'Corner Grocer',
    description: null,
    rawDescription: null,
    categoryId: null,
    isSplit: false,
    splits: [],
    transferId: null,
    paidByUserId: 1,
    status: 'cleared',
    source: 'manual',
    needsReview: false,
    cardSuffix: null,
    clientId: null,
    isPrivate: false,
    isMasked: false,
    tags: [],
    createdByUserId: 1,
    updatedByUserId: 1,
    createdAt: '2026-10-15T01:00:00.000Z',
    updatedAt: '2026-10-15T01:00:00.000Z',
    ...overrides,
  } as Transaction
}

export function aCategory(overrides: Partial<Category> = {}): Category {
  return {
    id: 10,
    categoryGroupId: 1,
    slug: 'groceries',
    name: 'Groceries',
    icon: null,
    sortOrder: 0,
    isHidden: false,
    isSystem: true,
    ...overrides,
  } as Category
}

export function aGroup(
  overrides: Partial<Omit<CategoryTree, 'categories'>> = {},
  categories: Category[] = []
): CategoryTree {
  return {
    id: 1,
    slug: 'food',
    name: 'Food',
    kind: 'expense',
    sortOrder: 0,
    isHidden: false,
    isSystem: true,
    ...overrides,
    categories,
  } as CategoryTree
}

/** Food (groceries, cafes), Housing (rent) and Income (salary). */
export function aCategoryTree(): CategoryTree[] {
  return [
    aGroup({ id: 1, slug: 'food', name: 'Food', sortOrder: 0 }, [
      aCategory({ id: 10, categoryGroupId: 1, slug: 'groceries', name: 'Groceries', sortOrder: 0 }),
      aCategory({ id: 11, categoryGroupId: 1, slug: 'cafe-coffee', name: 'Cafes', sortOrder: 1 }),
    ]),
    aGroup({ id: 2, slug: 'housing', name: 'Housing', sortOrder: 1 }, [
      aCategory({ id: 20, categoryGroupId: 2, slug: 'rent', name: 'Rent', sortOrder: 0 }),
    ]),
    aGroup({ id: 9, slug: 'income', name: 'Income', kind: 'income', sortOrder: 2 }, [
      aCategory({ id: 90, categoryGroupId: 9, slug: 'salary', name: 'Salary', sortOrder: 0 }),
    ]),
  ]
}

export function aMonthReport(month: YearMonth, overrides: Partial<MonthReport> = {}): MonthReport {
  return {
    month,
    from: `${month}-01`,
    to: `${month}-28`,
    incomeCents: 0,
    expenseCents: 0,
    netCents: 0,
    byGroup: [],
    byCategory: [],
    byPerson: [],
    uncategorizedCents: 0,
    pendingCents: 0,
    transactionCount: 0,
    topMovers: [],
    ...overrides,
  } as MonthReport
}

/** A six-month trend ending at `month`; `spent` lists the expense totals oldest first. */
export function aTrendReport(
  month: YearMonth,
  spent: readonly number[] = [0, 0, 0, 0, 0, 0],
  overrides: Partial<TrendReport> = {}
): TrendReport {
  const months = spent.map((_, index) => addMonths(month, index - spent.length + 1))
  return {
    months,
    groupBy: 'group',
    totals: months.map((ym, index) => ({
      month: ym,
      incomeCents: 0,
      expenseCents: spent[index] ?? 0,
      netCents: -(spent[index] ?? 0),
    })),
    series: [],
    ...overrides,
  } as TrendReport
}
