import type { YearMonth } from './month'
import {
  clearFilters,
  hasNarrowingFilters,
  initialFilters,
  toListQuery,
  type TransactionFilters,
} from './transaction-filters'

const october = '2026-10' as YearMonth

describe('toListQuery', () => {
  it('test_only_the_month_and_the_page_go_out_by_default', () => {
    expect(toListQuery(initialFilters(october), 1)).toEqual({
      month: '2026-10',
      page: 1,
      perPage: 50,
    })
  })

  it('test_every_filter_maps_to_its_api_parameter', () => {
    const filters: TransactionFilters = {
      month: october,
      accountId: 3,
      paidByUserId: 7,
      category: { type: 'category', id: 12 },
      q: '  woolworths ',
    }

    expect(toListQuery(filters, 2, 25)).toEqual({
      month: '2026-10',
      accountId: [3],
      paidByUserId: 7,
      categoryId: [12],
      q: 'woolworths',
      page: 2,
      perPage: 25,
    })
  })

  it('test_uncategorized_is_its_own_flag', () => {
    const filters = { ...initialFilters(october), category: { type: 'uncategorized' as const } }

    expect(toListQuery(filters, 1)).toEqual(expect.objectContaining({ uncategorized: true }))
    expect(toListQuery(filters, 1)).not.toHaveProperty('categoryId')
  })

  it('test_a_blank_search_is_not_sent', () => {
    expect(toListQuery({ ...initialFilters(october), q: '   ' }, 1)).not.toHaveProperty('q')
  })
})

describe('hasNarrowingFilters and clearFilters', () => {
  it('test_the_month_alone_does_not_count_as_a_filter', () => {
    expect(hasNarrowingFilters(initialFilters(october))).toBe(false)
    expect(hasNarrowingFilters({ ...initialFilters(october), accountId: 1 })).toBe(true)
    expect(hasNarrowingFilters({ ...initialFilters(october), q: 'x' })).toBe(true)
  })

  it('test_clearing_keeps_the_month', () => {
    const filters: TransactionFilters = {
      month: october,
      accountId: 3,
      paidByUserId: 7,
      category: { type: 'uncategorized' },
      q: 'x',
    }

    expect(clearFilters(filters)).toEqual(initialFilters(october))
  })
})
