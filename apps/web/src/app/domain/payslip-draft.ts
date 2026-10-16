/**
 * Payslips on the client: the "New payslip" form's draft, the service fee
 * it implies, what is still missing and the API body it becomes. A payout
 * is the gross minus the tax withheld, the service's fee and at most one
 * more line; the net is what reached the bank (a transfer already in the
 * ledger, or one the API creates). Pure: no Angular; the wire shapes are
 * restated structurally so domain stays free of core.
 */
import { ownerUserIdFor, type OwnerChoice } from './account-presets'

/** Where the net went: a transfer already in the ledger, or one the API creates. */
export type PayoutSource = 'transfer' | 'new'

/** A transfer leaving the account that no payslip explains yet (`GET /payslips/candidates`). */
export interface PayoutCandidate {
  transferId: number
  date: string
  amountCents: number
  toAccountId: number
  memo: string | null
}

/** A deduction line the person types (positive cents). */
export interface DeductionDraft {
  categoryId: number | null
  amountCents: number
  memo: string
}

/** What the form edits. Amounts are positive integer cents. */
export interface PayslipDraft {
  source: PayoutSource
  transferId: number | null
  /** With no transfer yet: where the API sends the net. */
  toAccountId: number | null
  /** What reached the bank: the transfer's amount, or typed when there is no transfer yet. */
  netCents: number
  /** 'YYYY-MM-DD' */
  date: string
  grossCents: number
  tax: DeductionDraft
  /** The service fee is the remainder; the person only picks its category. */
  feeCategoryId: number | null
  /** One more deduction, when the payout had one. */
  extra: DeductionDraft | null
  /** Who earned it. */
  person: OwnerChoice
  memo: string
}

/** What the form reports as missing, named like the API fields where there is one. */
export type PayslipProblem =
  | 'transferId'
  | 'toAccountId'
  | 'netCents'
  | 'grossCents'
  | 'deductions'
  | 'taxCategory'
  | 'feeCategory'
  | 'extra'

/** `POST /payslips` */
export interface PayslipBody {
  accountId: number
  date: string
  userId: number | null
  grossCents: number
  deductions: { categoryId: number; amountCents: number; memo: string | null }[]
  transferId?: number
  toAccountId?: number
  memo: string | null
}

export interface PayslipDraftDefaults {
  date: string
  person: OwnerChoice
  taxCategoryId: number | null
  feeCategoryId: number | null
}

export function emptyPayslipDraft(defaults: PayslipDraftDefaults): PayslipDraft {
  return {
    source: 'transfer',
    transferId: null,
    toAccountId: null,
    netCents: 0,
    date: defaults.date,
    grossCents: 0,
    tax: { categoryId: defaults.taxCategoryId, amountCents: 0, memo: '' },
    feeCategoryId: defaults.feeCategoryId,
    extra: null,
    person: defaults.person,
    memo: '',
  }
}

/** Links a transfer: its amount is the net and its date the payslip's. */
export function choosePayout(draft: PayslipDraft, payout: PayoutCandidate): PayslipDraft {
  return {
    ...draft,
    source: 'transfer',
    transferId: payout.transferId,
    toAccountId: null,
    netCents: payout.amountCents,
    date: payout.date,
  }
}

/** No transfer yet: the person types the net and picks where it goes. */
export function choosePayoutLater(draft: PayslipDraft): PayslipDraft {
  return { ...draft, source: 'new', transferId: null, netCents: 0 }
}

/**
 * The service fee, the deduction nobody types: gross minus net minus the
 * typed deductions (negative when they exceed the gap). The API checks the
 * same invariant (`gross - deductions = net`).
 */
export function serviceFeeCents(draft: PayslipDraft): number {
  return draft.grossCents - draft.netCents - draft.tax.amountCents - (draft.extra?.amountCents ?? 0)
}

export function payslipProblems(draft: PayslipDraft): PayslipProblem[] {
  const problems: PayslipProblem[] = []
  if (draft.source === 'transfer' && draft.transferId === null) {
    problems.push('transferId')
  }
  if (draft.source === 'new') {
    if (draft.toAccountId === null) {
      problems.push('toAccountId')
    }
    if (draft.netCents <= 0) {
      problems.push('netCents')
    }
  }
  const fee = serviceFeeCents(draft)
  if (draft.grossCents <= 0) {
    problems.push('grossCents')
  } else if (draft.netCents > 0 && fee < 0) {
    problems.push('deductions')
  }
  if (draft.tax.amountCents > 0 && draft.tax.categoryId === null) {
    problems.push('taxCategory')
  }
  if (fee > 0 && draft.feeCategoryId === null) {
    problems.push('feeCategory')
  }
  if (draft.extra && (draft.extra.amountCents <= 0 || draft.extra.categoryId === null)) {
    problems.push('extra')
  }
  return problems
}

function line(categoryId: number | null, amountCents: number, memo = '') {
  return categoryId !== null && amountCents > 0
    ? [{ categoryId, amountCents, memo: memo.trim() || null }]
    : []
}

/** The API body: tax, then the fee, then the extra line (empty ones left out). */
export function payslipPayload(
  draft: PayslipDraft,
  accountId: number,
  people: { youId: number; partnerId: number | null }
): PayslipBody {
  return {
    accountId,
    date: draft.date,
    userId: ownerUserIdFor(draft.person, people.youId, people.partnerId),
    grossCents: draft.grossCents,
    deductions: [
      ...line(draft.tax.categoryId, draft.tax.amountCents, draft.tax.memo),
      ...line(draft.feeCategoryId, serviceFeeCents(draft)),
      ...(draft.extra
        ? line(draft.extra.categoryId, draft.extra.amountCents, draft.extra.memo)
        : []),
    ],
    ...(draft.source === 'transfer'
      ? { transferId: draft.transferId ?? undefined }
      : { toAccountId: draft.toAccountId ?? undefined }),
    memo: draft.memo.trim() || null,
  }
}
