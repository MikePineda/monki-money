import {
  actionsFor,
  committedFigures,
  draftFrom,
  draftProblems,
  patchOf,
  sectionsOf,
  statusAfter,
  type RecurringFields,
} from './recurring'

function rent(overrides: Partial<RecurringFields> = {}): RecurringFields {
  return {
    payee: 'Harbour Lettings',
    cadence: 'weekly',
    amountCents: 50_000,
    nextExpectedDate: '2026-10-20',
    categoryId: 10,
    paidByUserId: null,
    ...overrides,
  }
}

describe('recurring payments', () => {
  it('test_free_after_bills_is_income_minus_spent_minus_still_due', () => {
    expect(
      committedFigures({
        incomeCents: 645_000,
        expenseCents: 328_450,
        committed: { paidCents: 100_000, upcomingCents: 106_500 },
      })
    ).toEqual({ paidCents: 100_000, dueCents: 106_500, freeCents: 210_050 })
  })

  it('test_free_after_bills_goes_negative_before_the_pay_arrives', () => {
    expect(
      committedFigures({
        incomeCents: 0,
        expenseCents: 0,
        committed: { paidCents: 0, upcomingCents: 106_500 },
      }).freeCents
    ).toBe(-106_500)
  })

  it('test_items_are_split_by_status_keeping_the_api_order', () => {
    const items = [
      { id: 1, status: 'active' as const },
      { id: 2, status: 'paused' as const },
      { id: 3, status: 'active' as const },
      { id: 4, status: 'dismissed' as const },
    ]

    expect(sectionsOf(items)).toEqual({
      active: [items[0], items[2]],
      paused: [items[1]],
      dismissed: [items[3]],
    })
  })

  it('test_each_status_offers_its_own_actions', () => {
    expect(actionsFor('active')).toEqual(['edit', 'pause', 'dismiss'])
    expect(actionsFor('paused')).toEqual(['edit', 'resume', 'dismiss'])
    expect(actionsFor('dismissed')).toEqual(['restore'])
    expect((['pause', 'resume', 'dismiss', 'restore', 'edit'] as const).map(statusAfter)).toEqual([
      'paused',
      'active',
      'dismissed',
      'active',
      null,
    ])
  })

  it('test_a_new_draft_starts_monthly_today_and_needs_a_payee_and_an_amount', () => {
    const draft = draftFrom(undefined, '2026-10-16')

    expect(draft).toEqual({
      payee: '',
      cadence: 'monthly',
      amountCents: 0,
      nextExpectedDate: '2026-10-16',
      categoryId: null,
      paidByUserId: null,
    })
    expect(draftProblems(draft)).toEqual(['payee', 'amountCents'])
    expect(draftProblems({ ...draft, payee: '  ', nextExpectedDate: '' })).toEqual([
      'payee',
      'amountCents',
      'nextExpectedDate',
    ])
    expect(draftProblems({ ...draft, payee: 'Telco One', amountCents: 6_500 })).toEqual([])
  })

  it('test_an_edit_sends_only_what_changed', () => {
    const item = rent()
    const draft = { ...draftFrom(item, '2026-10-16'), amountCents: 52_000, categoryId: null }

    expect(patchOf(item, draft)).toEqual({ amountCents: 52_000, categoryId: null })
    expect(patchOf(item, draftFrom(item, '2026-10-16'))).toEqual({})
    expect(patchOf(item, { ...draftFrom(item, '2026-10-16'), payee: '  Rent ' })).toEqual({
      payee: 'Rent',
    })
  })
})
