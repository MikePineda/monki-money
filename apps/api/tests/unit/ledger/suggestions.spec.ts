import { test } from '@japa/runner'
import { suggestionsFrom, type SuggestionRow } from '#domain/ledger/suggestions'

const TODAY = '2026-10-15'
const ACTIVE = new Set([1, 2, 3])

let nextId = 1

function row(overrides: Partial<SuggestionRow>): SuggestionRow {
  return {
    id: nextId++,
    kind: 'expense',
    date: TODAY,
    accountId: 1,
    amountCents: -1_000,
    categoryId: null,
    payee: null,
    transferId: null,
    hidden: false,
    ...overrides,
  }
}

function legs(transferId: number, from: number, to: number, date = TODAY): SuggestionRow[] {
  return [
    row({ kind: 'transfer', transferId, accountId: from, amountCents: -5_000, date }),
    row({ kind: 'transfer', transferId, accountId: to, amountCents: 5_000, date }),
  ]
}

function suggest(rows: SuggestionRow[], lastAccountId: number | null = null) {
  return suggestionsFrom(rows, { today: TODAY, activeAccountIds: ACTIVE, lastAccountId })
}

test.group('Ledger: quick add suggestions', () => {
  test('test_categories_rank_by_use_weighted_by_recency_per_kind', ({ assert }) => {
    const result = suggest([
      // Three uses in June lose to two this week.
      row({ categoryId: 10, date: '2026-06-01' }),
      row({ categoryId: 10, date: '2026-06-02' }),
      row({ categoryId: 10, date: '2026-06-03' }),
      row({ categoryId: 11, date: '2026-10-14' }),
      row({ categoryId: 11, date: '2026-10-13' }),
      row({ kind: 'income', categoryId: 90, amountCents: 100_000 }),
      // Split rows have no category of their own.
      row({ categoryId: null }),
    ])

    assert.deepEqual(
      result.categories.expense.map((line) => line.categoryId),
      [11, 10]
    )
    assert.deepEqual(result.categories.income, [{ categoryId: 90, score: 1, lastDate: TODAY }])
    assert.equal(result.categories.expense[0].lastDate, '2026-10-14')
    assert.equal(result.asOf, TODAY)
  })

  test('test_payees_share_one_key_and_keep_the_newest_spelling', ({ assert }) => {
    const result = suggest([
      row({ payee: 'Café Nero', date: '2026-10-14' }),
      row({ payee: 'CAFE NERO', date: '2026-10-01' }),
      row({ payee: '  ', date: '2026-10-14' }),
      row({ payee: 'Woolworths', date: '2026-10-10' }),
      row({ kind: 'income', payee: 'Employer', amountCents: 100_000 }),
    ])

    assert.deepEqual(
      result.payees.expense.map((line) => line.payee),
      ['Café Nero', 'Woolworths']
    )
    assert.deepEqual(
      result.payees.income.map((line) => line.payee),
      ['Employer']
    )
  })

  test('test_routes_read_transfer_legs_and_skip_inactive_accounts', ({ assert }) => {
    const result = suggest([
      ...legs(1, 1, 2),
      ...legs(2, 1, 2, '2026-10-01'),
      ...legs(3, 2, 3),
      // Account 9 is inactive (or gone).
      ...legs(4, 1, 9),
    ])

    assert.deepEqual(
      result.routes.map((route) => [route.fromAccountId, route.toAccountId]),
      [
        [1, 2],
        [2, 3],
      ]
    )
  })

  test('test_hidden_rows_reveal_no_category_payee_or_route', ({ assert }) => {
    const result = suggest([
      row({ categoryId: 10, payee: 'Jewellery store', hidden: true }),
      ...legs(5, 1, 2).map((leg) => ({ ...leg, hidden: true })),
    ])

    assert.deepEqual(result.categories.expense, [])
    assert.deepEqual(result.payees.expense, [])
    assert.deepEqual(result.routes, [])
  })

  test('test_the_last_account_is_passed_through_and_scores_are_rounded', ({ assert }) => {
    const result = suggest([row({ categoryId: 10, date: '2026-10-08' })], 2)

    assert.equal(result.lastAccountId, 2)
    // 0.5^(7/30), four decimals.
    assert.equal(result.categories.expense[0].score, 0.8507)
  })

  test('test_lists_are_capped', ({ assert }) => {
    const rows = Array.from({ length: 30 }, (_, index) =>
      row({ categoryId: 100 + index, payee: `Shop ${index}` })
    )

    const result = suggest(rows)

    assert.lengthOf(result.categories.expense, 20)
    assert.lengthOf(result.payees.expense, 20)
  })
})
