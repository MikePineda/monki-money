import type Payslip from '#models/payslip'
import { BaseTransformer } from '@adonisjs/core/transformers'
import { isoTimestamp } from '#domain/time/iso_timestamp'
import { isHiddenFrom, type PrivacyViewer } from '#domain/ledger/privacy'

/**
 * A payslip as `viewer` may see it (needs `lines` and `transfer`
 * preloaded). Amounts are positive except the lines', which keep the
 * ledger's sign (the gross positive, deductions negative); the gross line
 * comes first. A line a partner made private keeps its amount but not its
 * category or memo (`isMasked`); the payslip's memo goes with the gross line.
 */
export default class PayslipTransformer extends BaseTransformer<Payslip> {
  constructor(
    resource: Payslip,
    protected viewer: PrivacyViewer
  ) {
    super(resource)
  }

  toObject() {
    const payslip = this.resource
    const lines = [...(payslip.lines ?? [])].sort(
      (a, b) => Number(b.kind === 'income') - Number(a.kind === 'income') || a.id - b.id
    )
    const transfer = payslip.transfer ?? null
    const gross = lines.find((line) => line.kind === 'income')
    const memoHidden = gross !== undefined && isHiddenFrom(gross, this.viewer)

    return {
      id: payslip.id,
      accountId: payslip.accountId,
      userId: payslip.userId,
      date: payslip.date,
      grossCents: payslip.grossCents,
      netCents: payslip.netCents,
      deductionsCents: payslip.grossCents - payslip.netCents,
      memo: memoHidden ? null : payslip.memo,
      transferId: payslip.transferId,
      transfer: transfer
        ? {
            id: transfer.id,
            date: transfer.date,
            amountCents: transfer.amountCents,
            fromAccountId: transfer.fromAccountId,
            toAccountId: transfer.toAccountId,
          }
        : null,
      lines: lines.map((line) => {
        const masked = isHiddenFrom(line, this.viewer)
        return {
          transactionId: line.id,
          kind: line.kind,
          categoryId: masked ? null : line.categoryId,
          amountCents: line.amountCents,
          memo: masked ? null : line.description,
          isMasked: masked,
        }
      }),
      clientId: payslip.clientId,
      createdByUserId: payslip.createdByUserId,
      createdAt: isoTimestamp(payslip.createdAt)!,
      updatedAt: isoTimestamp(payslip.updatedAt)!,
    }
  }
}
