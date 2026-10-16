import { suggestTags, tagPeriod, tagSpending, tagTrend } from './tags'

describe('suggestTags', () => {
  const known = ['Bali 2027', 'camping', 'Wedding', 'bali villa', 'Work trip']

  it('test_recently_used_tags_come_first_without_the_chosen_ones', () => {
    expect(suggestTags(known, ['camping'], '')).toEqual([
      'Bali 2027',
      'Wedding',
      'bali villa',
      'Work trip',
    ])
  })

  it('test_typing_narrows_them_with_prefix_matches_first_ignoring_case_and_accents', () => {
    expect(suggestTags(known, [], 'BALI')).toEqual(['Bali 2027', 'bali villa'])
    expect(suggestTags(known, [], 'trip')).toEqual(['Work trip'])
    expect(suggestTags([...known, 'Café crawl'], [], 'cafe')).toEqual(['Café crawl'])
    // "w" starts "Wedding" and "Work trip": both come before tags that only contain it.
    expect(suggestTags(['bali 2027 wow', 'Wedding', 'Work trip'], [], 'w')).toEqual([
      'Wedding',
      'Work trip',
      'bali 2027 wow',
    ])
  })

  it('test_an_exact_match_of_what_was_typed_is_still_offered', () => {
    expect(suggestTags(known, [], 'camping')).toEqual(['camping'])
  })

  it('test_suggestions_are_capped', () => {
    const many = Array.from({ length: 20 }, (_, index) => `tag ${index}`)

    expect(suggestTags(many, [], '')).toHaveLength(8)
    expect(suggestTags(many, [], '', 3)).toEqual(['tag 0', 'tag 1', 'tag 2'])
  })
})

describe('tagSpending', () => {
  const labels = { category: (id: number) => `Category ${id}`, uncategorized: 'Uncategorised' }

  it('test_one_bar_per_spending_category_with_uncategorised_as_other', () => {
    const bars = tagSpending(
      [
        { bucket: 'category', categoryId: 7, kind: 'expense', amountCents: 7_000 },
        { bucket: 'uncategorized', categoryId: null, kind: 'expense', amountCents: 1_500 },
        { bucket: 'category', categoryId: 3, kind: 'expense', amountCents: 6_000 },
      ],
      labels
    )

    expect(bars).toEqual([
      { id: 'category:7', label: 'Category 7', valueCents: 7_000 },
      { id: 'uncategorized', label: 'Uncategorised', valueCents: 1_500, other: true },
      { id: 'category:3', label: 'Category 3', valueCents: 6_000 },
    ])
  })

  it('test_income_and_fully_refunded_categories_draw_no_bar', () => {
    const bars = tagSpending(
      [
        { bucket: 'category', categoryId: 90, kind: 'income', amountCents: 50_000 },
        { bucket: 'category', categoryId: 4, kind: 'expense', amountCents: -2_000 },
        { bucket: 'category', categoryId: 5, kind: 'expense', amountCents: 0 },
      ],
      labels
    )

    expect(bars).toEqual([])
  })
})

describe('tagTrend', () => {
  const months = [
    { month: '2026-07', expenseCents: 0, incomeCents: 0, setAsideCents: 80_000 },
    { month: '2026-08', expenseCents: 0, incomeCents: 0, setAsideCents: 0 },
    { month: '2026-09', expenseCents: 13_000, incomeCents: 0, setAsideCents: 0 },
  ]

  it('test_one_point_per_month_with_the_spent_and_set_aside_series', () => {
    expect(tagTrend(months)).toEqual({
      series: ['spent', 'setAside'],
      data: [
        {
          x: '2026-07',
          series: [
            { id: 'spent', valueCents: 0 },
            { id: 'setAside', valueCents: 80_000 },
          ],
        },
        {
          x: '2026-08',
          series: [
            { id: 'spent', valueCents: 0 },
            { id: 'setAside', valueCents: 0 },
          ],
        },
        {
          x: '2026-09',
          series: [
            { id: 'spent', valueCents: 13_000 },
            { id: 'setAside', valueCents: 0 },
          ],
        },
      ],
    })
  })

  it('test_the_set_aside_series_only_shows_when_money_was_set_aside', () => {
    const spendingOnly = months.map((month) => ({ ...month, setAsideCents: 0 }))

    expect(tagTrend(spendingOnly).series).toEqual(['spent'])
    expect(tagTrend(spendingOnly).data[2]).toEqual({
      x: '2026-09',
      series: [{ id: 'spent', valueCents: 13_000 }],
    })
  })
})

describe('tagPeriod', () => {
  it('test_the_months_of_the_first_and_last_use', () => {
    expect(tagPeriod('2026-07-15', '2027-01-10')).toEqual(['2026-07', '2027-01'])
    expect(tagPeriod('2026-10-01', '2026-10-31')).toEqual(['2026-10'])
    expect(tagPeriod(null, null)).toEqual([])
  })
})
