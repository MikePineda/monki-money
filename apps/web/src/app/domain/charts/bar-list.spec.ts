import { layoutBarList, type BarListDatum } from './bar-list'

const SPENDING: BarListDatum[] = [
  {
    id: 'food',
    label: 'Food',
    valueCents: 84_230,
    children: [
      { id: 'groceries', label: 'Groceries', valueCents: 61_240 },
      { id: 'eating-out', label: 'Eating out', valueCents: 22_990 },
    ],
  },
  { id: 'other', label: 'Other', valueCents: 27_720, other: true },
  { id: 'housing', label: 'Housing', valueCents: 162_000 },
  { id: 'transport', label: 'Transport', valueCents: 21_460 },
]

describe('layoutBarList', () => {
  it('test_groups_are_sorted_by_amount_with_other_pinned_last', () => {
    const { rows } = layoutBarList(SPENDING, [])

    expect(rows.map((row) => row.id)).toEqual(['housing', 'food', 'transport', 'other'])
  })

  it('test_bar_lengths_share_one_scale_anchored_on_the_largest_value', () => {
    const { rows, maxCents } = layoutBarList(SPENDING, [])

    expect(maxCents).toBe(162_000)
    expect(rows[0]?.fraction).toBe(1)
    expect(rows[1]?.fraction).toBeCloseTo(84_230 / 162_000)
  })

  it('test_single_series_bars_are_neutral_and_other_is_muted', () => {
    const { rows } = layoutBarList(SPENDING, [])

    expect(rows.find((row) => row.id === 'housing')?.color).toBe('neutral')
    expect(rows.find((row) => row.id === 'other')?.color).toBe('muted')
  })

  it('test_an_explicit_colour_follows_the_entity', () => {
    const { rows } = layoutBarList([{ label: 'You', valueCents: 100, color: 'person-a' }], [])

    expect(rows[0]?.color).toBe('person-a')
  })

  it('test_collapsed_groups_hide_children_but_say_they_can_expand', () => {
    const { rows } = layoutBarList(SPENDING, [])
    const food = rows.find((row) => row.id === 'food')

    expect(rows.some((row) => row.depth === 1)).toBe(false)
    expect(food?.expandable).toBe(true)
    expect(food?.expanded).toBe(false)
    expect(rows.find((row) => row.id === 'housing')?.expandable).toBe(false)
  })

  it('test_expanded_groups_list_children_sorted_under_their_parent_on_the_same_scale', () => {
    const { rows } = layoutBarList(SPENDING, ['food'])
    const ids = rows.map((row) => row.id)
    const groceries = rows.find((row) => row.id === 'groceries')

    expect(ids).toEqual(['housing', 'food', 'groceries', 'eating-out', 'transport', 'other'])
    expect(rows.find((row) => row.id === 'food')?.expanded).toBe(true)
    expect(groceries?.depth).toBe(1)
    expect(groceries?.parentId).toBe('food')
    expect(groceries?.fraction).toBeCloseTo(61_240 / 162_000)
    expect(groceries?.color).toBe('neutral')
  })

  it('test_shares_and_total_come_from_the_top_level_rows', () => {
    const layout = layoutBarList(SPENDING, [])

    expect(layout.totalCents).toBe(162_000 + 84_230 + 21_460 + 27_720)
    expect(layout.rows.map((row) => row.percent).reduce((a, b) => a + b, 0)).toBe(100)
  })

  it('test_ids_default_to_labels_and_child_ids_are_namespaced', () => {
    const { rows } = layoutBarList(
      [{ label: 'Food', valueCents: 10, children: [{ label: 'Coffee', valueCents: 10 }] }],
      ['Food']
    )

    expect(rows.map((row) => row.id)).toEqual(['Food', 'Food/Coffee'])
  })

  it('test_a_negative_net_amount_draws_no_bar_but_keeps_its_value', () => {
    const { rows } = layoutBarList(
      [
        { label: 'Refunds', valueCents: -4_000 },
        { label: 'Food', valueCents: 10_000 },
      ],
      []
    )
    const refunds = rows.find((row) => row.id === 'Refunds')

    expect(refunds?.fraction).toBe(0)
    expect(refunds?.valueCents).toBe(-4_000)
  })

  it('test_all_zero_values_draw_no_bars', () => {
    const { rows, maxCents } = layoutBarList([{ label: 'Food', valueCents: 0 }], [])

    expect(maxCents).toBe(0)
    expect(rows[0]?.fraction).toBe(0)
  })

  it('test_empty_input_is_an_empty_layout', () => {
    expect(layoutBarList([], [])).toEqual({ rows: [], totalCents: 0, maxCents: 0 })
  })
})
