import { test } from '@japa/runner'
import { postingsFor } from '#domain/ledger/privacy'
import { posting, transferLegs } from '#tests/helpers/postings'
import { excludeTransfers, summarizeMonth } from '#domain/reports/month_summary'

const GROCERIES = { categoryId: 10, groupId: 1, groupKind: 'expense' as const }
const RESTAURANTS = { categoryId: 11, groupId: 1, groupKind: 'expense' as const }
const RENT = { categoryId: 20, groupId: 2, groupKind: 'expense' as const }
const SALARY = { categoryId: 90, groupId: 9, groupKind: 'income' as const }

test.group('Reports: month summary', () => {
  test('test_transfer_is_excluded_from_expense_totals', ({ assert }) => {
    const postings = [posting({ ...GROCERIES, amountCents: -5_000 }), ...transferLegs(100_000)]

    const summary = summarizeMonth(postings, '2026-10')

    assert.equal(summary.expenseCents, 5_000)
    assert.equal(summary.incomeCents, 0)
    assert.equal(summary.netCents, -5_000)
    assert.equal(summary.transactionCount, 1)
    assert.lengthOf(excludeTransfers(postings), 1)
    assert.deepEqual(
      summary.byCategory.map((line) => line.categoryId),
      [GROCERIES.categoryId]
    )
  })

  test('test_split_lines_are_counted_per_category_not_per_parent', ({ assert }) => {
    // One supermarket receipt of 100.00: 70.00 groceries + 30.00 restaurants.
    const lines = [
      posting({ ...GROCERIES, transactionId: 500, splitId: 1, amountCents: -7_000 }),
      posting({ ...RESTAURANTS, transactionId: 500, splitId: 2, amountCents: -3_000 }),
    ]

    const summary = summarizeMonth(lines, '2026-10')

    assert.equal(summary.expenseCents, 10_000)
    assert.equal(summary.transactionCount, 1)
    assert.deepEqual(
      summary.byCategory.map((line) => [line.categoryId, line.amountCents, line.count]),
      [
        [GROCERIES.categoryId, 7_000, 1],
        [RESTAURANTS.categoryId, 3_000, 1],
      ]
    )
    assert.deepEqual(
      summary.byGroup.map((line) => [line.groupId, line.amountCents]),
      [[1, 10_000]]
    )
  })

  test('test_refund_reduces_expense_in_same_category', ({ assert }) => {
    const postings = [
      posting({ ...GROCERIES, amountCents: -8_000 }),
      // The refund is entered as income, but in the groceries category.
      posting({ ...GROCERIES, kind: 'income', amountCents: 2_000 }),
      posting({ ...SALARY, kind: 'income', amountCents: 300_000 }),
    ]

    const summary = summarizeMonth(postings, '2026-10')

    assert.equal(summary.expenseCents, 6_000)
    assert.equal(summary.incomeCents, 300_000)
    const groceries = summary.byCategory.find((line) => line.categoryId === GROCERIES.categoryId)
    assert.equal(groceries?.amountCents, 6_000)
    assert.equal(groceries?.kind, 'expense')
  })

  test('test_month_summary_only_counts_dates_inside_the_calendar_month', ({ assert }) => {
    const postings = [
      posting({ date: '2026-09-30', amountCents: -100 }),
      posting({ date: '2026-10-01', amountCents: -200 }),
      posting({ date: '2026-10-31', amountCents: -400 }),
      posting({ date: '2026-11-01', amountCents: -800 }),
    ]

    const summary = summarizeMonth(postings, '2026-10')

    assert.equal(summary.expenseCents, 600)
    assert.equal(summary.from, '2026-10-01')
    assert.equal(summary.to, '2026-10-31')
    assert.equal(summary.month, '2026-10')
  })

  test('test_by_person_puts_null_payer_in_joint_bucket', ({ assert }) => {
    const postings = [
      posting({ paidByUserId: 1, amountCents: -1_000 }),
      posting({ paidByUserId: 2, amountCents: -2_500 }),
      posting({ paidByUserId: null, amountCents: -4_000 }),
      posting({ ...SALARY, kind: 'income', paidByUserId: 2, amountCents: 50_000 }),
    ]

    const summary = summarizeMonth(postings, '2026-10')

    assert.deepEqual(summary.byPerson, [
      { bucket: 'member', userId: 1, incomeCents: 0, expenseCents: 1_000, netCents: -1_000 },
      { bucket: 'member', userId: 2, incomeCents: 50_000, expenseCents: 2_500, netCents: 47_500 },
      { bucket: 'joint', userId: null, incomeCents: 0, expenseCents: 4_000, netCents: -4_000 },
    ])
  })

  test('test_uncategorized_and_pending_totals', ({ assert }) => {
    const postings = [
      posting({ categoryId: null, groupId: null, groupKind: null, amountCents: -1_500 }),
      posting({
        categoryId: null,
        groupId: null,
        groupKind: null,
        kind: 'income',
        amountCents: 700,
      }),
      posting({ ...RENT, status: 'pending', amountCents: -57_500 }),
    ]

    const summary = summarizeMonth(postings, '2026-10')

    assert.equal(summary.uncategorizedCents, 2_200)
    assert.equal(summary.pendingCents, 57_500)
    assert.equal(summary.expenseCents, 59_000)
    assert.equal(summary.incomeCents, 700)
    const uncategorized = summary.byCategory.filter((line) => line.bucket === 'uncategorized')
    assert.sameDeepMembers(
      uncategorized.map((line) => [line.kind, line.amountCents]),
      [
        ['expense', 1_500],
        ['income', 700],
      ]
    )
  })

  test('test_lines_are_sorted_expense_first_then_by_amount', ({ assert }) => {
    const postings = [
      posting({ ...GROCERIES, amountCents: -1_000 }),
      posting({ ...RENT, amountCents: -9_000 }),
      posting({ ...SALARY, kind: 'income', amountCents: 20_000 }),
    ]

    const summary = summarizeMonth(postings, '2026-10')

    assert.deepEqual(
      summary.byCategory.map((line) => line.categoryId),
      [RENT.categoryId, GROCERIES.categoryId, SALARY.categoryId]
    )
    assert.deepEqual(
      summary.byGroup.map((line) => [line.bucket, line.groupId, line.kind]),
      [
        ['group', 2, 'expense'],
        ['group', 1, 'expense'],
        ['group', 9, 'income'],
      ]
    )
  })

  test('test_private_postings_report_under_the_private_bucket_for_the_partner', ({ assert }) => {
    const gift = posting({ ...GROCERIES, amountCents: -20_000, isPrivate: true, paidByUserId: 1 })
    const postings = [gift, posting({ ...GROCERIES, amountCents: -1_000, paidByUserId: 2 })]

    const partnerView = summarizeMonth(postingsFor(postings, 2), '2026-10')
    const payerView = summarizeMonth(postingsFor(postings, 1), '2026-10')

    // Same totals for both of them.
    assert.equal(partnerView.expenseCents, 21_000)
    assert.equal(payerView.expenseCents, 21_000)

    // The partner sees the amount as "private", never in groceries.
    assert.deepEqual(
      partnerView.byCategory.map((line) => [line.bucket, line.categoryId, line.amountCents]),
      [
        ['private', null, 20_000],
        ['category', GROCERIES.categoryId, 1_000],
      ]
    )
    assert.deepEqual(
      partnerView.byGroup.map((line) => [line.bucket, line.groupId, line.amountCents]),
      [
        ['private', null, 20_000],
        ['group', 1, 1_000],
      ]
    )
    // The payer sees it in its category.
    assert.deepEqual(
      payerView.byCategory.map((line) => [line.bucket, line.categoryId, line.amountCents]),
      [['category', GROCERIES.categoryId, 21_000]]
    )
  })

  test('test_joint_private_posting_belongs_to_its_creator', ({ assert }) => {
    const gift = posting({ isPrivate: true, paidByUserId: null, createdByUserId: 2 })

    assert.isFalse(postingsFor([gift], 2)[0].hidden)
    assert.isTrue(postingsFor([gift], 1)[0].hidden)
  })
})
