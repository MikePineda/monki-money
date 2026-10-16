import { test } from '@japa/runner'
import { largestExpenses } from '#domain/reports/top_expenses'
import { posting, transferLegs } from '#tests/helpers/postings'

const GROCERIES = { categoryId: 10, groupId: 1, groupKind: 'expense' as const }
const ALCOHOL = { categoryId: 11, groupId: 1, groupKind: 'expense' as const }
const SALARY = { categoryId: 90, groupId: 9, groupKind: 'income' as const }

test.group('Reports: largest expenses', () => {
  test('test_largest_expenses_are_the_biggest_expense_rows_of_the_month', ({ assert }) => {
    const small = posting({ ...GROCERIES, date: '2026-10-02', amountCents: -500 })
    const big = posting({ ...GROCERIES, date: '2026-10-03', amountCents: -9_000 })
    const middle = posting({ ...GROCERIES, date: '2026-10-04', amountCents: -2_500 })
    const postings = [
      small,
      big,
      middle,
      // Income, a refund in an expense category, transfers and other months never count.
      posting({ ...SALARY, kind: 'income', date: '2026-10-05', amountCents: 300_000 }),
      posting({ ...GROCERIES, kind: 'income', date: '2026-10-06', amountCents: 20_000 }),
      ...transferLegs(50_000, { date: '2026-10-07' }),
      posting({ ...GROCERIES, date: '2026-09-30', amountCents: -99_999 }),
    ]

    const top = largestExpenses(postings, '2026-10', 2)

    assert.deepEqual(
      top.map((row) => [row.transactionId, row.amountCents]),
      [
        [big.transactionId, -9_000],
        [middle.transactionId, -2_500],
      ]
    )
    assert.deepEqual(top[0], {
      transactionId: big.transactionId,
      date: '2026-10-03',
      amountCents: -9_000,
      categoryId: GROCERIES.categoryId,
      isSplit: false,
      paidByUserId: 1,
      hidden: false,
    })
  })

  test('test_a_split_expense_counts_once_with_its_whole_amount', ({ assert }) => {
    const lines = [
      posting({ ...GROCERIES, transactionId: 500, splitId: 1, amountCents: -7_000 }),
      posting({ ...ALCOHOL, transactionId: 500, splitId: 2, amountCents: -3_000 }),
    ]
    const single = posting({ ...GROCERIES, amountCents: -8_000 })

    const top = largestExpenses([...lines, single], '2026-10')

    assert.deepEqual(
      top.map((row) => [row.transactionId, row.amountCents, row.isSplit, row.categoryId]),
      [
        [500, -10_000, true, null],
        [single.transactionId, -8_000, false, GROCERIES.categoryId],
      ]
    )
  })

  test('test_ties_go_to_the_latest_row_and_hidden_rows_keep_their_amount', ({ assert }) => {
    const earlier = posting({ ...GROCERIES, date: '2026-10-01', amountCents: -1_000 })
    const later = posting({ ...GROCERIES, date: '2026-10-09', amountCents: -1_000 })
    const hidden = posting({
      date: '2026-10-05',
      amountCents: -4_000,
      categoryId: null,
      groupId: null,
      groupKind: null,
      isPrivate: true,
      hidden: true,
    })

    const top = largestExpenses([earlier, later, hidden], '2026-10')

    assert.deepEqual(
      top.map((row) => [row.transactionId, row.hidden]),
      [
        [hidden.transactionId, true],
        [later.transactionId, false],
        [earlier.transactionId, false],
      ]
    )
  })

  test('test_a_hidden_split_expense_does_not_say_it_is_split', ({ assert }) => {
    const hidden = { categoryId: null, groupId: null, groupKind: null, hidden: true }
    const lines = [
      posting({ ...hidden, transactionId: 700, splitId: 1, amountCents: -1_000 }),
      posting({ ...hidden, transactionId: 700, splitId: 2, amountCents: -500 }),
    ]

    assert.deepInclude(largestExpenses(lines, '2026-10')[0], {
      amountCents: -1_500,
      isSplit: false,
      categoryId: null,
      hidden: true,
    })
  })

  test('test_an_expense_row_that_adds_up_to_money_in_never_shows', ({ assert }) => {
    // Typed as an expense but positive (a refund keyed the wrong way), and a
    // split whose lines net to zero: neither is money spent.
    const positive = posting({ ...GROCERIES, amountCents: 2_500 })
    const netZero = [
      posting({ ...GROCERIES, transactionId: 800, splitId: 1, amountCents: -1_000 }),
      posting({ ...ALCOHOL, transactionId: 800, splitId: 2, amountCents: 1_000 }),
    ]
    const spent = posting({ ...GROCERIES, amountCents: -300 })

    assert.deepEqual(
      largestExpenses([positive, ...netZero, spent], '2026-10').map((row) => row.transactionId),
      [spent.transactionId]
    )
  })

  test('test_largest_expenses_default_to_five', ({ assert }) => {
    const postings = Array.from({ length: 7 }, (_, index) =>
      posting({ ...GROCERIES, amountCents: -(index + 1) * 100 })
    )

    assert.lengthOf(largestExpenses(postings, '2026-10'), 5)
  })
})
