import {
  spendByGroup,
  spendByPerson,
  spendDelta,
  spendTrend,
  totalsSeries,
  type SpendLabels,
} from './month-view'

describe('spendDelta', () => {
  it('test_less_than_last_month_is_down_with_a_whole_percent', () => {
    expect(spendDelta(328_450, 357_120)).toEqual({
      direction: 'down',
      cents: 28_670,
      percent: 8,
    })
  })

  it('test_more_than_last_month_is_up', () => {
    expect(spendDelta(120_000, 100_000)).toEqual({ direction: 'up', cents: 20_000, percent: 20 })
  })

  it('test_the_same_amount_is_flat', () => {
    expect(spendDelta(5_000, 5_000)).toEqual({ direction: 'flat', cents: 0, percent: 0 })
  })

  it('test_no_previous_spending_has_no_percent', () => {
    expect(spendDelta(5_000, 0)).toEqual({ direction: 'up', cents: 5_000, percent: null })
  })
})

const labels: SpendLabels = {
  group: (id) => ({ 1: 'Housing', 2: 'Food' })[id] ?? '',
  category: (id) => ({ 10: 'Rent', 20: 'Groceries', 21: 'Coffee' })[id] ?? '',
  uncategorized: 'Uncategorised',
  private: 'Private',
}

describe('spendByGroup', () => {
  const byGroup = [
    { bucket: 'group', groupId: 1, kind: 'expense', amountCents: 162_000 },
    { bucket: 'group', groupId: 2, kind: 'expense', amountCents: 84_230 },
    { bucket: 'uncategorized', groupId: null, kind: 'expense', amountCents: 4_000 },
    { bucket: 'private', groupId: null, kind: 'expense', amountCents: 6_000 },
    { bucket: 'group', groupId: 9, kind: 'income', amountCents: 645_000 },
  ] as const
  const byCategory = [
    { bucket: 'category', categoryId: 10, groupId: 1, kind: 'expense', amountCents: 162_000 },
    { bucket: 'category', categoryId: 20, groupId: 2, kind: 'expense', amountCents: 80_000 },
    { bucket: 'category', categoryId: 21, groupId: 2, kind: 'expense', amountCents: 4_230 },
    { bucket: 'category', categoryId: 90, groupId: 9, kind: 'income', amountCents: 645_000 },
  ] as const

  it('test_expense_groups_with_their_categories_as_children', () => {
    const data = spendByGroup(byGroup, byCategory, labels)

    expect(data[0]).toEqual({
      id: 'group:1',
      label: 'Housing',
      valueCents: 162_000,
      children: [{ id: 'category:10', label: 'Rent', valueCents: 162_000 }],
    })
    expect(data[1]?.children?.map((child) => child.label)).toEqual(['Groceries', 'Coffee'])
  })

  it('test_income_is_left_out', () => {
    expect(spendByGroup(byGroup, byCategory, labels).map((datum) => datum.label)).not.toContain('')
    expect(spendByGroup(byGroup, byCategory, labels)).toHaveLength(4)
  })

  it('test_uncategorised_and_private_are_muted_other_buckets', () => {
    const data = spendByGroup(byGroup, byCategory, labels)

    expect(data.filter((datum) => datum.other).map((datum) => datum.label)).toEqual([
      'Uncategorised',
      'Private',
    ])
  })

  it('test_refunds_that_outweigh_spending_are_not_drawn', () => {
    const data = spendByGroup(
      [{ bucket: 'group', groupId: 1, kind: 'expense', amountCents: -500 }],
      [],
      labels
    )

    expect(data).toEqual([])
  })
})

describe('spendByPerson', () => {
  const people = { youId: 1, partnerId: 2 }
  const names = { you: 'You', partner: 'Alex', joint: 'Joint' }

  it('test_you_partner_and_joint_in_that_order_with_person_colours', () => {
    const data = spendByPerson(
      [
        { bucket: 'joint', userId: null, expenseCents: 75_600 },
        { bucket: 'member', userId: 2, expenseCents: 101_800 },
        { bucket: 'member', userId: 1, expenseCents: 151_000 },
      ],
      people,
      names
    )

    expect(data).toEqual([
      { id: 'you', label: 'You', valueCents: 151_000, color: 'person-a' },
      { id: 'partner', label: 'Alex', valueCents: 101_800, color: 'person-b' },
      { id: 'joint', label: 'Joint', valueCents: 75_600, color: 'muted' },
    ])
  })

  it('test_without_a_partner_there_is_no_partner_bucket', () => {
    const data = spendByPerson(
      [{ bucket: 'member', userId: 1, expenseCents: 100 }],
      { youId: 1, partnerId: null },
      names
    )

    expect(data.map((datum) => datum.id)).toEqual(['you', 'joint'])
  })

  it('test_nothing_spent_means_no_bar', () => {
    expect(spendByPerson([], people, names)).toEqual([])
  })
})

describe('trend inputs', () => {
  const totals = [
    { month: '2026-09', incomeCents: 600_000, expenseCents: 357_120, netCents: 242_880 },
    { month: '2026-10', incomeCents: 645_000, expenseCents: 328_450, netCents: 316_550 },
  ]

  it('test_one_spent_series_per_month', () => {
    expect(spendTrend(totals, 'spent')).toEqual([
      { x: '2026-09', series: [{ id: 'spent', valueCents: 357_120 }] },
      { x: '2026-10', series: [{ id: 'spent', valueCents: 328_450 }] },
    ])
  })

  it('test_sparkline_values_per_measure', () => {
    expect(totalsSeries(totals, 'incomeCents')).toEqual([600_000, 645_000])
    expect(totalsSeries(totals, 'netCents')).toEqual([242_880, 316_550])
  })
})
