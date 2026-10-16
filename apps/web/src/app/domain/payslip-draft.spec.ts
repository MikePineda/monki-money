import {
  choosePayout,
  choosePayoutLater,
  emptyPayslipDraft,
  payslipPayload,
  payslipProblems,
  serviceFeeCents,
  type PayoutCandidate,
  type PayslipDraft,
} from './payslip-draft'

const PEOPLE = { youId: 1, partnerId: 2 }
const TAXES = 31
const FEES = 32
const OTHER = 33

const payout: PayoutCandidate = {
  transferId: 7,
  date: '2026-08-31',
  amountCents: 370_000,
  toAccountId: 2,
  memo: null,
}

function blank(): PayslipDraft {
  return emptyPayslipDraft({
    date: '2026-10-16',
    person: 'you',
    taxCategoryId: TAXES,
    feeCategoryId: FEES,
  })
}

/** Gross 5,000.00 and 1,250.00 tax against the 3,700.00 payout: the fee is 50.00. */
function typical(): PayslipDraft {
  const draft = choosePayout(blank(), payout)
  return { ...draft, grossCents: 500_000, tax: { ...draft.tax, amountCents: 125_000 } }
}

describe('payslip draft', () => {
  it('test_a_new_draft_waits_for_a_payout_and_defaults_the_categories', () => {
    const draft = blank()

    expect(draft.source).toBe('transfer')
    expect(draft.transferId).toBeNull()
    expect(draft.tax.categoryId).toBe(TAXES)
    expect(draft.feeCategoryId).toBe(FEES)
    expect(draft.extra).toBeNull()
    expect(payslipProblems(draft)).toEqual(['transferId', 'grossCents'])
  })

  it('test_choosing_a_transfer_takes_its_amount_as_the_net_and_its_date', () => {
    const draft = choosePayout({ ...blank(), source: 'new', toAccountId: 5 }, payout)

    expect(draft).toMatchObject({
      source: 'transfer',
      transferId: 7,
      toAccountId: null,
      netCents: 370_000,
      date: '2026-08-31',
    })
  })

  it('test_no_transfer_yet_asks_for_the_destination_and_the_net', () => {
    const draft = choosePayoutLater(typical())

    expect(draft).toMatchObject({ source: 'new', transferId: null, netCents: 0 })
    expect(payslipProblems(draft)).toEqual(['toAccountId', 'netCents'])
  })

  it('test_the_service_fee_is_what_the_tax_leaves_between_gross_and_net', () => {
    expect(serviceFeeCents(typical())).toBe(5_000)
  })

  it('test_an_extra_line_comes_out_of_the_service_fee', () => {
    const draft = { ...typical(), extra: { categoryId: OTHER, amountCents: 1_000, memo: '' } }

    expect(serviceFeeCents(draft)).toBe(4_000)
  })

  it('test_deductions_beyond_the_gap_are_a_problem', () => {
    const draft = { ...typical(), tax: { categoryId: TAXES, amountCents: 140_000, memo: '' } }

    expect(serviceFeeCents(draft)).toBe(-10_000)
    expect(payslipProblems(draft)).toEqual(['deductions'])
  })

  it('test_a_fee_or_a_tax_needs_a_category_and_an_extra_line_needs_both_fields', () => {
    const draft: PayslipDraft = {
      ...typical(),
      tax: { categoryId: null, amountCents: 125_000, memo: '' },
      feeCategoryId: null,
      extra: { categoryId: null, amountCents: 0, memo: '' },
    }

    expect(payslipProblems(draft)).toEqual(['taxCategory', 'feeCategory', 'extra'])
  })

  it('test_a_complete_draft_has_no_problems', () => {
    expect(payslipProblems(typical())).toEqual([])
  })

  it('test_payload_links_the_transfer_and_lists_tax_then_fee', () => {
    const body = payslipPayload({ ...typical(), memo: '  August invoice ' }, 9, PEOPLE)

    expect(body).toEqual({
      accountId: 9,
      date: '2026-08-31',
      userId: 1,
      grossCents: 500_000,
      deductions: [
        { categoryId: TAXES, amountCents: 125_000, memo: null },
        { categoryId: FEES, amountCents: 5_000, memo: null },
      ],
      transferId: 7,
      memo: 'August invoice',
    })
  })

  it('test_payload_without_a_transfer_names_the_destination_and_skips_empty_lines', () => {
    const draft: PayslipDraft = {
      ...choosePayoutLater(typical()),
      toAccountId: 2,
      netCents: 375_000,
      person: 'joint',
      extra: { categoryId: OTHER, amountCents: 0, memo: '' },
    }

    // 5,000.00 - 1,250.00 - 3,750.00 leaves no fee: only the tax line goes.
    expect(payslipPayload(draft, 9, PEOPLE)).toEqual({
      accountId: 9,
      date: '2026-08-31',
      userId: null,
      grossCents: 500_000,
      deductions: [{ categoryId: TAXES, amountCents: 125_000, memo: null }],
      toAccountId: 2,
      memo: null,
    })
  })

  it('test_payload_keeps_the_extra_line_with_its_memo_and_the_partner', () => {
    const draft: PayslipDraft = {
      ...typical(),
      person: 'partner',
      extra: { categoryId: OTHER, amountCents: 1_000, memo: ' Levy ' },
    }

    expect(payslipPayload(draft, 9, PEOPLE).deductions).toEqual([
      { categoryId: TAXES, amountCents: 125_000, memo: null },
      { categoryId: FEES, amountCents: 4_000, memo: null },
      { categoryId: OTHER, amountCents: 1_000, memo: 'Levy' },
    ])
    expect(payslipPayload(draft, 9, PEOPLE).userId).toBe(2)
  })
})
