/**
 * Payslips: a payout recorded as its gross income plus deduction lines
 * (tax withheld, the service's fee, one more if needed) in the account the
 * money arrived in, linked to the transfer that took the net to the bank.
 * Amounts are positive integer cents; the invariant is
 * `gross - sum(deductions) = net`.
 */

/** Deduction lines one payslip may carry (typically tax and the service fee, plus one free line). */
export const PAYSLIP_MAX_DEDUCTIONS = 3

function sum(amounts: readonly number[]): number {
  return amounts.reduce((total, cents) => total + cents, 0)
}

/** What reaches the bank: the gross minus every deduction (negative when they exceed it). */
export function payslipNetCents(grossCents: number, deductionCents: readonly number[]): number {
  return grossCents - sum(deductionCents)
}
