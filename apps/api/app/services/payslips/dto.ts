/** Inputs of PayslipService. Amounts are positive integer cents, dates 'YYYY-MM-DD'. */

export interface PayslipDeductionInput {
  categoryId: number
  amountCents: number
  memo?: string | null
}

export interface CreatePayslipInput {
  /** Where the gross arrived (the umbrella service's wallet). */
  accountId: number
  date: string
  /** Who earned it: null = joint, omitted = the account's owner. */
  userId?: number | null
  grossCents: number
  deductions: PayslipDeductionInput[]
  /** A transfer that already left `accountId` for the net amount... */
  transferId?: number
  /** ...or the account to create that transfer to. */
  toAccountId?: number
  memo?: string | null
}

export interface PayslipFilters {
  accountId?: number
}

/** A transfer leaving the account that no payslip explains yet. */
export interface PayslipCandidate {
  transferId: number
  date: string
  amountCents: number
  toAccountId: number
  memo: string | null
}
