import {
  actionsFor,
  committedFigures,
  createBody,
  draftFrom,
  draftProblems,
  patchOf,
  pickSuggestion,
  sectionsOf,
  statusAfter,
  suggestionsFor,
  type MerchantSuggestion,
  type RecurringFields,
} from './recurring'

function merchant(overrides: Partial<MerchantSuggestion> = {}): MerchantSuggestion {
  return {
    merchantKey: 'rent harbour lettings',
    payee: 'Rent',
    amountCents: 50_000,
    lastPaidDate: '2026-10-13',
    count: 4,
    ...overrides,
  }
}

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

  it('test_free_after_bills_goes_negative_when_bills_take_more_than_is_left', () => {
    expect(
      committedFigures({
        incomeCents: 100_000,
        expenseCents: 50_000,
        committed: { paidCents: 0, upcomingCents: 106_500 },
      }).freeCents
    ).toBe(-56_500)
  })

  it('test_free_after_bills_is_unknown_until_income_arrives', () => {
    expect(
      committedFigures({
        incomeCents: 0,
        expenseCents: 30_000,
        committed: { paidCents: 0, upcomingCents: 106_500 },
      })
    ).toEqual({ paidCents: 0, dueCents: 106_500, freeCents: null })
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
      merchantKey: null,
    })
    expect(draftProblems(draft)).toEqual(['payee', 'amountCents'])
    expect(draftProblems({ ...draft, payee: '  ', nextExpectedDate: '' })).toEqual([
      'payee',
      'amountCents',
      'nextExpectedDate',
    ])
    expect(draftProblems({ ...draft, payee: 'Telco One', amountCents: 6_500 })).toEqual([])
  })

  it('test_a_picked_merchant_keys_the_new_item_like_the_bank', () => {
    const typed = { ...draftFrom(undefined, '2026-10-16'), payee: 'Rent' }
    expect(createBody(typed)).not.toHaveProperty('merchantKey')

    const picked = pickSuggestion(draftFrom(undefined, '2026-10-16'), merchant())
    expect(picked).toMatchObject({
      payee: 'Rent',
      merchantKey: 'rent harbour lettings',
      amountCents: 50_000,
    })
    expect(createBody(picked).merchantKey).toBe('rent harbour lettings')
    // An amount already typed is kept.
    expect(pickSuggestion({ ...typed, amountCents: 48_000 }, merchant()).amountCents).toBe(48_000)
  })

  it('test_suggestions_follow_what_is_typed', () => {
    const merchants = [
      merchant(),
      merchant({ merchantKey: 'telco one', payee: 'Telco One', amountCents: 6_500 }),
      merchant({ merchantKey: 'pulse gym', payee: 'Pulse Gym', amountCents: 2_990 }),
    ]

    expect(suggestionsFor(merchants, '').map((entry) => entry.payee)).toEqual([
      'Rent',
      'Telco One',
      'Pulse Gym',
    ])
    expect(suggestionsFor(merchants, 'harbour').map((entry) => entry.payee)).toEqual(['Rent'])
    expect(suggestionsFor(merchants, 'tel').map((entry) => entry.payee)).toEqual(['Telco One'])
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
