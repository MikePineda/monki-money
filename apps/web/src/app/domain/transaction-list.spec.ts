import { groupByDay, recentPayees, relativeDay, type LedgerRow } from './transaction-list'

let nextId = 1

function row(overrides: Partial<LedgerRow> & Pick<LedgerRow, 'date' | 'amountCents'>): LedgerRow {
  return {
    id: nextId++,
    kind: overrides.amountCents < 0 ? 'expense' : 'income',
    transferId: null,
    accountId: 1,
    ...overrides,
  }
}

describe('groupByDay', () => {
  it('test_rows_are_grouped_by_date_in_the_order_they_arrive', () => {
    const rows = [
      row({ date: '2026-10-15', amountCents: -4820 }),
      row({ date: '2026-10-15', amountCents: -50 }),
      row({ date: '2026-10-14', amountCents: 645000 }),
    ]

    const groups = groupByDay(rows)

    expect(groups.map((group) => [group.date, group.items.length])).toEqual([
      ['2026-10-15', 2],
      ['2026-10-14', 1],
    ])
  })

  it('test_day_subtotal_adds_expenses_and_income_signed', () => {
    const groups = groupByDay([
      row({ date: '2026-10-14', amountCents: 645000 }),
      row({ date: '2026-10-14', amountCents: -3500 }),
    ])

    expect(groups[0]?.subtotalCents).toBe(641500)
  })

  it('test_transfer_legs_are_merged_into_one_item_and_left_out_of_the_subtotal', () => {
    const out = row({
      date: '2026-10-14',
      amountCents: -50000,
      kind: 'transfer',
      transferId: 9,
      accountId: 1,
    })
    const incoming = row({
      date: '2026-10-14',
      amountCents: 50000,
      kind: 'transfer',
      transferId: 9,
      accountId: 2,
    })
    const groups = groupByDay([incoming, row({ date: '2026-10-14', amountCents: -1200 }), out])

    expect(groups[0]?.items).toHaveLength(2)
    expect(groups[0]?.items[0]).toEqual({
      type: 'transfer',
      key: 'transfer-9',
      outgoing: out,
      incoming,
    })
    expect(groups[0]?.subtotalCents).toBe(-1200)
  })

  it('test_a_lone_transfer_leg_still_shows_as_a_transfer', () => {
    const leg = row({
      date: '2026-10-13',
      amountCents: -50000,
      kind: 'transfer',
      transferId: 4,
    })

    expect(groupByDay([leg])[0]?.items[0]).toEqual({
      type: 'transfer',
      key: 'transfer-4',
      outgoing: leg,
      incoming: null,
    })
  })
})

describe('relativeDay', () => {
  it('test_today_and_yesterday_are_named_other_days_are_not', () => {
    expect(relativeDay('2026-10-15', '2026-10-15')).toBe('today')
    expect(relativeDay('2026-10-14', '2026-10-15')).toBe('yesterday')
    expect(relativeDay('2026-09-30', '2026-10-01')).toBe('yesterday')
    expect(relativeDay('2026-10-13', '2026-10-15')).toBeNull()
  })
})

describe('recentPayees', () => {
  it('test_distinct_payees_most_recent_first_matching_the_typed_prefix', () => {
    const payees = ['Riverside Grocer', 'Translink', 'riverside grocer', null, 'Coles']

    expect(recentPayees(payees, '')).toEqual(['Riverside Grocer', 'Translink', 'Coles'])
    expect(recentPayees(payees, 'river')).toEqual(['Riverside Grocer'])
    expect(recentPayees(payees, 'Translink')).toEqual([])
    expect(recentPayees(payees, '', 2)).toEqual(['Riverside Grocer', 'Translink'])
  })
})
