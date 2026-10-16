import { test } from '@japa/runner'
import { postingsFor } from '#domain/ledger/privacy'
import { tagDetail, tagTotals } from '#domain/reports/tag_summary'
import { posting, transferLegs } from '#tests/helpers/postings'

const GROCERIES = { categoryId: 10, groupId: 1, groupKind: 'expense' as const }
const RESTAURANTS = { categoryId: 11, groupId: 1, groupKind: 'expense' as const }
const SALARY = { categoryId: 90, groupId: 9, groupKind: 'income' as const }
const BALI = ['bali']

/** A transfer of `amountCents` from an everyday account into a savings one. */
function intoSavings(amountCents: number, overrides: Parameters<typeof transferLegs>[1] = {}) {
  const [outgoing, incoming] = transferLegs(amountCents, overrides)
  return [
    { ...outgoing, accountKind: 'transaction' as const },
    { ...incoming, accountKind: 'savings' as const },
  ]
}

test.group('Reports: tag summary', () => {
  test('test_tag_totals_exclude_transfers_but_count_savings_transfers_as_set_aside', ({
    assert,
  }) => {
    const postings = [
      posting({ ...GROCERIES, tags: BALI, amountCents: -5_000, date: '2026-12-02' }),
      posting({ ...SALARY, kind: 'income', tags: BALI, amountCents: 1_000, date: '2026-12-03' }),
      // Moved to savings for the trip: set aside, never spending or income.
      ...intoSavings(80_000, { tags: BALI, date: '2026-07-15' }),
      // A tagged transfer between two everyday accounts: neither.
      ...transferLegs(3_000, { tags: BALI, date: '2026-12-04' }),
      // Untagged money never counts.
      posting({ ...GROCERIES, amountCents: -9_999 }),
      ...intoSavings(50_000),
    ]

    const [bali] = tagTotals(postings)

    assert.deepEqual(bali, {
      tag: 'bali',
      count: 4,
      expenseCents: 5_000,
      incomeCents: 1_000,
      netCents: -4_000,
      setAsideCents: 80_000,
      firstDate: '2026-07-15',
      lastDate: '2026-12-04',
    })
  })

  test('test_split_lines_inherit_the_parent_tags', ({ assert }) => {
    // One 100.00 receipt split 70/30, tagged once on the parent.
    const lines = [
      posting({ ...GROCERIES, transactionId: 500, splitId: 1, amountCents: -7_000, tags: BALI }),
      posting({ ...RESTAURANTS, transactionId: 500, splitId: 2, amountCents: -3_000, tags: BALI }),
    ]

    const detail = tagDetail(lines, 'bali')

    assert.equal(detail?.count, 1)
    assert.equal(detail?.expenseCents, 10_000)
    assert.deepEqual(
      detail?.byCategory.map((line) => [line.categoryId, line.amountCents, line.count]),
      [
        [GROCERIES.categoryId, 7_000, 1],
        [RESTAURANTS.categoryId, 3_000, 1],
      ]
    )
  })

  test('test_tag_totals_are_scoped_to_the_date_range', ({ assert }) => {
    const postings = [
      posting({ tags: BALI, amountCents: -100, date: '2026-09-30' }),
      posting({ tags: BALI, amountCents: -200, date: '2026-10-01' }),
      posting({ tags: BALI, amountCents: -400, date: '2026-10-31' }),
      posting({ tags: BALI, amountCents: -800, date: '2026-11-01' }),
      posting({ tags: ['lombok'], amountCents: -1_600, date: '2026-12-01' }),
    ]

    const totals = tagTotals(postings, { from: '2026-10-01', to: '2026-10-31' })
    const detail = tagDetail(postings, 'bali', { from: '2026-10-01', to: '2026-10-31' })
    const onlyFrom = tagTotals(postings, { from: '2026-11-01' })

    assert.deepEqual(
      totals.map((line) => [line.tag, line.expenseCents, line.firstDate, line.lastDate]),
      [['bali', 600, '2026-10-01', '2026-10-31']]
    )
    assert.equal(detail?.expenseCents, 600)
    assert.deepEqual(
      detail?.byMonth.map((line) => line.month),
      ['2026-10']
    )
    assert.deepEqual(
      onlyFrom.map((line) => [line.tag, line.expenseCents]),
      [
        ['lombok', 1_600],
        ['bali', 800],
      ]
    )
  })

  test('test_tags_are_sorted_by_last_use_then_by_name', ({ assert }) => {
    const postings = [
      posting({ tags: ['wedding', 'bali'], date: '2026-08-01' }),
      posting({ tags: ['bali'], date: '2026-10-20' }),
      posting({ tags: ['camping'], date: '2026-10-20' }),
      posting({ tags: ['wedding'], date: '2026-09-01' }),
    ]

    assert.deepEqual(
      tagTotals(postings).map((line) => [line.tag, line.count]),
      [
        ['bali', 2],
        ['camping', 1],
        ['wedding', 2],
      ]
    )
  })

  test('test_a_refund_reduces_the_tagged_spending', ({ assert }) => {
    const postings = [
      posting({ ...GROCERIES, tags: BALI, amountCents: -8_000 }),
      posting({ ...GROCERIES, kind: 'income', tags: BALI, amountCents: 2_000 }),
    ]

    const [bali] = tagTotals(postings)

    assert.include(bali, { expenseCents: 6_000, incomeCents: 0, netCents: -6_000, count: 2 })
  })

  test('test_a_partners_private_tags_are_never_revealed', ({ assert }) => {
    const partnersGift = posting({
      tags: ['anniversary'],
      isPrivate: true,
      paidByUserId: 2,
      amountCents: -12_000,
    })
    const mine = posting({ tags: ['anniversary'], isPrivate: true, paidByUserId: 1 })
    const viewer = { userId: 1, memberIds: new Set([1, 2]) }

    const asTheReader = postingsFor([partnersGift, mine], viewer)
    const asThePartner = postingsFor([partnersGift], { ...viewer, userId: 2 })

    assert.deepEqual(
      tagTotals(asTheReader).map((line) => [line.tag, line.expenseCents]),
      [['anniversary', 1_000]]
    )
    assert.deepEqual(
      tagTotals(asThePartner).map((line) => [line.tag, line.expenseCents]),
      [['anniversary', 12_000]]
    )
    assert.isNull(tagDetail(postingsFor([partnersGift], viewer), 'anniversary'))
  })

  test('test_tag_detail_breaks_down_by_category_month_and_person', ({ assert }) => {
    const postings = [
      posting({
        ...GROCERIES,
        tags: BALI,
        paidByUserId: 1,
        amountCents: -3_000,
        date: '2026-11-03',
      }),
      posting({
        ...RESTAURANTS,
        tags: BALI,
        paidByUserId: null,
        amountCents: -7_000,
        date: '2027-01-10',
      }),
      posting({
        ...SALARY,
        kind: 'income',
        tags: BALI,
        paidByUserId: 2,
        amountCents: 500,
        date: '2027-01-11',
      }),
      ...intoSavings(40_000, { tags: BALI, date: '2026-11-20', paidByUserId: 1 }),
    ]

    const detail = tagDetail(postings, 'bali')

    assert.include(detail, {
      tag: 'bali',
      expenseCents: 10_000,
      incomeCents: 500,
      setAsideCents: 40_000,
      firstDate: '2026-11-03',
      lastDate: '2027-01-11',
    })
    assert.deepEqual(
      detail?.byCategory.map((line) => [line.bucket, line.categoryId, line.kind, line.amountCents]),
      [
        ['category', RESTAURANTS.categoryId, 'expense', 7_000],
        ['category', GROCERIES.categoryId, 'expense', 3_000],
        ['category', SALARY.categoryId, 'income', 500],
      ]
    )
    // Every calendar month between the first and the last use, quiet ones included.
    assert.deepEqual(detail?.byMonth, [
      { month: '2026-11', expenseCents: 3_000, incomeCents: 0, setAsideCents: 40_000 },
      { month: '2026-12', expenseCents: 0, incomeCents: 0, setAsideCents: 0 },
      { month: '2027-01', expenseCents: 7_000, incomeCents: 500, setAsideCents: 0 },
    ])
    assert.deepEqual(detail?.byPerson, [
      { bucket: 'member', userId: 1, incomeCents: 0, expenseCents: 3_000, netCents: -3_000 },
      { bucket: 'member', userId: 2, incomeCents: 500, expenseCents: 0, netCents: 500 },
      { bucket: 'joint', userId: null, incomeCents: 0, expenseCents: 7_000, netCents: -7_000 },
    ])
  })

  test('test_a_tag_outside_the_range_still_exists_with_zero_totals', ({ assert }) => {
    const postings = [posting({ tags: BALI, amountCents: -100, date: '2026-09-30' })]

    const detail = tagDetail(postings, 'bali', { from: '2026-10-01' })

    assert.deepEqual(detail, {
      tag: 'bali',
      count: 0,
      expenseCents: 0,
      incomeCents: 0,
      netCents: 0,
      setAsideCents: 0,
      firstDate: null,
      lastDate: null,
      byCategory: [],
      byMonth: [],
      byPerson: [],
    })
  })

  test('test_an_unknown_tag_has_no_detail', ({ assert }) => {
    const postings = [posting({ tags: BALI }), posting({ tags: [] })]

    assert.isNull(tagDetail(postings, 'lombok'))
    assert.isNull(tagDetail(postings, 'Bali'))
    assert.deepEqual(tagTotals([posting()]), [])
  })
})
