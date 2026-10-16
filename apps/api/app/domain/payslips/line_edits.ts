import type { TransactionKind } from '@monkimoney/shared'

/** A ledger row of a payslip as stored (signed amount). */
export interface PayslipLine {
  accountId: number
  kind: TransactionKind
  date: string
  amountCents: number
}

/** The money fields of an edit as people send it (amounts typed positive); labels are ignored. */
export type LineEdit = Partial<PayslipLine>

/**
 * True when an edit would move a payslip line's money: its amount, kind,
 * account or date belong to the payslip (gross - deductions = net, on the
 * payslip's day), so only the payslip may change them. Labels (category,
 * payee, notes, tags, privacy) stay free, and sending a field back with
 * its current value is not a change.
 */
export function touchesPayslipTotals(line: PayslipLine, edit: LineEdit): boolean {
  return (
    (edit.accountId !== undefined && edit.accountId !== line.accountId) ||
    (edit.kind !== undefined && edit.kind !== line.kind) ||
    (edit.date !== undefined && edit.date !== line.date) ||
    (edit.amountCents !== undefined && Math.abs(edit.amountCents) !== Math.abs(line.amountCents))
  )
}
