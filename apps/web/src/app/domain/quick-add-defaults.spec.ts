import {
  defaultAccountFor,
  defaultTransferPair,
  payeeSuggestions,
  rankCategories,
  recencyWeight,
  transferPresets,
  type RecentEntry,
} from './quick-add-defaults'

const TODAY = '2026-10-15'

let nextId = 1

function entry(overrides: Partial<RecentEntry>): RecentEntry {
  return {
    id: nextId++,
    kind: 'expense',
    date: TODAY,
    accountId: 1,
    amountCents: -1000,
    categoryId: null,
    payee: null,
    transferId: null,
    createdByUserId: 1,
    ...overrides,
  }
}

/** Expense candidates in their default (sort) order. */
const EXPENSE_CATEGORIES = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map((id) => ({ id }))

describe('recencyWeight', () => {
  it('test_today_weighs_one_and_halves_every_thirty_days', () => {
    expect(recencyWeight(TODAY, TODAY)).toBe(1)
    expect(recencyWeight('2026-09-15', TODAY)).toBeCloseTo(0.5, 5)
    expect(recencyWeight('2026-08-16', TODAY)).toBeCloseTo(0.25, 5)
  })

  it('test_future_dates_count_as_today', () => {
    expect(recencyWeight('2026-10-20', TODAY)).toBe(1)
  })
})

describe('rankCategories', () => {
  it('test_without_history_keeps_the_default_order', () => {
    expect(rankCategories([], 'expense', TODAY, EXPENSE_CATEGORIES)).toEqual([
      10, 11, 12, 13, 14, 15, 16,
    ])
  })

  it('test_frequency_moves_a_category_to_the_front', () => {
    const recent = [entry({ categoryId: 15 }), entry({ categoryId: 15 }), entry({ categoryId: 12 })]

    expect(rankCategories(recent, 'expense', TODAY, EXPENSE_CATEGORIES).slice(0, 3)).toEqual([
      15, 12, 10,
    ])
  })

  it('test_recency_beats_old_frequency', () => {
    const recent = [
      entry({ categoryId: 11, date: '2026-06-01' }),
      entry({ categoryId: 11, date: '2026-06-02' }),
      entry({ categoryId: 11, date: '2026-06-03' }),
      entry({ categoryId: 13, date: '2026-10-14' }),
    ]

    expect(rankCategories(recent, 'expense', TODAY, EXPENSE_CATEGORIES)[0]).toBe(13)
  })

  it('test_equal_scores_prefer_the_most_recent_use', () => {
    const recent = [
      entry({ categoryId: 14, date: TODAY, id: 100 }),
      entry({ categoryId: 16, date: TODAY, id: 101 }),
    ]

    expect(rankCategories(recent, 'expense', TODAY, EXPENSE_CATEGORIES).slice(0, 2)).toEqual([
      16, 14,
    ])
  })

  it('test_only_counts_rows_of_the_same_kind', () => {
    const recent = [entry({ kind: 'income', categoryId: 18, amountCents: 5000 })]

    expect(rankCategories(recent, 'expense', TODAY, EXPENSE_CATEGORIES)).not.toContain(18)
  })

  it('test_ignores_categories_that_are_not_candidates', () => {
    const recent = [entry({ categoryId: 999 }), entry({ categoryId: 999 })]

    expect(rankCategories(recent, 'expense', TODAY, EXPENSE_CATEGORIES)).not.toContain(999)
  })

  it('test_server_scores_rank_and_queued_entries_add_to_them', () => {
    const base = [
      { categoryId: 12, score: 2, lastDate: '2026-10-10' },
      { categoryId: 14, score: 1.5, lastDate: '2026-10-12' },
      // Hidden since, or of another kind: not a candidate.
      { categoryId: 999, score: 9, lastDate: TODAY },
    ]
    // Two uses waiting in the outbox today (weight 1 each) put 14 ahead.
    const queued = [entry({ categoryId: 14 }), entry({ categoryId: 14 })]

    expect(rankCategories([], 'expense', TODAY, EXPENSE_CATEGORIES, 3, base)).toEqual([12, 14, 10])
    expect(rankCategories(queued, 'expense', TODAY, EXPENSE_CATEGORIES, 3, base)).toEqual([
      14, 12, 10,
    ])
  })

  it('test_returns_at_most_the_limit', () => {
    expect(rankCategories([], 'expense', TODAY, EXPENSE_CATEGORIES, 3)).toEqual([10, 11, 12])
    expect(rankCategories([], 'expense', TODAY, EXPENSE_CATEGORIES.slice(0, 2))).toEqual([10, 11])
  })
})

describe('defaultAccountFor', () => {
  const accounts = [
    { id: 1, isActive: true },
    { id: 2, isActive: true },
    { id: 3, isActive: false },
  ]

  it('test_the_stored_account_wins_when_it_is_still_active', () => {
    const recent = [entry({ accountId: 1, createdByUserId: 7 })]

    expect(defaultAccountFor(7, recent, accounts, 2)).toBe(2)
  })

  it('test_an_archived_stored_account_falls_back_to_history', () => {
    const recent = [entry({ accountId: 2, createdByUserId: 7 })]

    expect(defaultAccountFor(7, recent, accounts, 3)).toBe(2)
  })

  it('test_history_uses_the_latest_row_this_person_created', () => {
    const recent = [
      entry({ accountId: 1, createdByUserId: 8, date: '2026-10-15' }),
      entry({ accountId: 2, createdByUserId: 7, date: '2026-10-14' }),
      entry({ accountId: 1, createdByUserId: 7, date: '2026-10-01' }),
    ]

    expect(defaultAccountFor(7, recent, accounts, null)).toBe(2)
  })

  it('test_transfer_legs_do_not_pick_the_expense_account', () => {
    const recent = [
      entry({ kind: 'transfer', accountId: 2, transferId: 5, createdByUserId: 7 }),
      entry({ accountId: 1, createdByUserId: 7, date: '2026-10-01' }),
    ]

    expect(defaultAccountFor(7, recent, accounts, null)).toBe(1)
  })

  it('test_without_anything_it_is_the_first_active_account', () => {
    expect(defaultAccountFor(7, [], [{ id: 3, isActive: false }, ...accounts], null)).toBe(1)
  })

  it('test_the_server_last_account_comes_after_this_device_and_the_queue', () => {
    expect(defaultAccountFor(7, [], accounts, null, 2)).toBe(2)
    // Archived since: the first active one.
    expect(defaultAccountFor(7, [], accounts, null, 3)).toBe(1)
    // A queued entry is newer than anything on the server.
    expect(
      defaultAccountFor(7, [entry({ accountId: 1, createdByUserId: 7 })], accounts, null, 2)
    ).toBe(1)
    expect(defaultAccountFor(7, [], accounts, 1, 2)).toBe(1)
  })

  it('test_no_active_account_means_none', () => {
    expect(defaultAccountFor(7, [], [{ id: 3, isActive: false }], null)).toBeNull()
  })
})

describe('transferPresets', () => {
  const active = [
    { id: 1, isActive: true },
    { id: 2, isActive: true },
    { id: 4, isActive: true },
  ]

  function legs(transferId: number, from: number, to: number, date = TODAY): RecentEntry[] {
    return [
      entry({ kind: 'transfer', transferId, accountId: from, amountCents: -5000, date }),
      entry({ kind: 'transfer', transferId, accountId: to, amountCents: 5000, date }),
    ]
  }

  it('test_pairs_are_read_from_both_legs_and_ranked_by_use', () => {
    const recent = [...legs(1, 1, 2), ...legs(2, 1, 2), ...legs(3, 4, 1)]

    expect(transferPresets(recent, active, TODAY)).toEqual([
      { fromAccountId: 1, toAccountId: 2 },
      { fromAccountId: 4, toAccountId: 1 },
    ])
  })

  it('test_a_lone_leg_is_ignored', () => {
    const recent = [legs(1, 1, 2)[0] as RecentEntry]

    expect(transferPresets(recent, active, TODAY)).toEqual([])
  })

  it('test_pairs_with_an_inactive_account_are_skipped', () => {
    const recent = legs(1, 1, 9)

    expect(transferPresets(recent, active, TODAY)).toEqual([])
  })

  it('test_server_routes_merge_with_queued_transfers', () => {
    const base = [
      { fromAccountId: 1, toAccountId: 2, score: 1.2, lastDate: '2026-10-01' },
      // Account 9 was archived since.
      { fromAccountId: 2, toAccountId: 9, score: 5, lastDate: TODAY },
    ]

    expect(transferPresets([], active, TODAY, 3, base)).toEqual([
      { fromAccountId: 1, toAccountId: 2 },
    ])
    expect(transferPresets([...legs(7, 4, 1), ...legs(8, 4, 1)], active, TODAY, 3, base)).toEqual([
      { fromAccountId: 4, toAccountId: 1 },
      { fromAccountId: 1, toAccountId: 2 },
    ])
  })

  it('test_limits_the_number_of_presets', () => {
    const recent = [...legs(1, 1, 2), ...legs(2, 2, 4), ...legs(3, 4, 1), ...legs(4, 2, 1)]

    expect(transferPresets(recent, active, TODAY, 2)).toHaveLength(2)
  })
})

describe('defaultTransferPair', () => {
  const accounts = [
    { id: 1, isActive: true, kind: 'transaction' as const },
    { id: 2, isActive: true, kind: 'savings' as const },
    { id: 3, isActive: true, kind: 'cash' as const },
  ]

  it('test_the_most_used_pair_wins', () => {
    expect(defaultTransferPair(accounts, [{ fromAccountId: 3, toAccountId: 1 }], 1)).toEqual({
      fromAccountId: 3,
      toAccountId: 1,
    })
  })

  it('test_without_history_it_goes_from_the_default_account_to_savings', () => {
    expect(defaultTransferPair(accounts, [], 1)).toEqual({ fromAccountId: 1, toAccountId: 2 })
  })

  it('test_without_savings_it_picks_the_next_active_account', () => {
    expect(defaultTransferPair(accounts.slice(0, 1).concat(accounts[2]!), [], 1)).toEqual({
      fromAccountId: 1,
      toAccountId: 3,
    })
  })

  it('test_a_single_account_cannot_make_a_pair', () => {
    expect(defaultTransferPair(accounts.slice(0, 1), [], 1)).toEqual({
      fromAccountId: 1,
      toAccountId: null,
    })
  })
})

describe('payeeSuggestions', () => {
  it('test_frequent_recent_payees_come_first_without_duplicates', () => {
    const recent = [
      entry({ payee: 'Riverside Grocer' }),
      entry({ payee: 'riverside grocer ' }),
      entry({ payee: 'Kmart' }),
      entry({ payee: 'Translink', date: '2026-05-01' }),
    ]

    expect(payeeSuggestions(recent, 'expense', '', TODAY)).toEqual([
      'Riverside Grocer',
      'Kmart',
      'Translink',
    ])
  })

  it('test_filters_by_the_typed_text_ignoring_accents', () => {
    const recent = [entry({ payee: 'Café Nero' }), entry({ payee: 'Coles' })]

    expect(payeeSuggestions(recent, 'expense', 'cafe', TODAY)).toEqual(['Café Nero'])
  })

  it('test_hides_the_payee_already_typed_exactly', () => {
    const recent = [entry({ payee: 'Coles' }), entry({ payee: 'Coles Express' })]

    expect(payeeSuggestions(recent, 'expense', 'coles', TODAY)).toEqual(['Coles Express'])
  })

  it('test_server_payees_merge_with_queued_ones_by_their_key', () => {
    const base = [
      { payee: 'Kmart', score: 2.5, lastDate: '2026-10-10' },
      { payee: 'Café Nero', score: 1, lastDate: '2026-10-01' },
    ]
    const queued = [entry({ payee: 'cafe nero' }), entry({ payee: 'CAFE NERO' })]

    expect(payeeSuggestions([], 'expense', '', TODAY, 4, base)).toEqual(['Kmart', 'Café Nero'])
    // 1 + 2 queued uses today beat Kmart; the newest spelling (queued first) shows.
    expect(payeeSuggestions(queued, 'expense', '', TODAY, 4, base)).toEqual(['cafe nero', 'Kmart'])
    expect(payeeSuggestions([], 'expense', 'caf', TODAY, 4, base)).toEqual(['Café Nero'])
  })

  it('test_keeps_to_the_same_kind_and_limit', () => {
    const recent = [
      entry({ payee: 'Employer Pty Ltd', kind: 'income', amountCents: 100 }),
      entry({ payee: 'A' }),
      entry({ payee: 'B' }),
      entry({ payee: 'C' }),
    ]

    expect(payeeSuggestions(recent, 'income', '', TODAY)).toEqual(['Employer Pty Ltd'])
    expect(payeeSuggestions(recent, 'expense', '', TODAY, 2)).toHaveLength(2)
  })
})
