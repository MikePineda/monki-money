import type Transfer from '#models/transfer'
import { isHiddenFrom, unlessHiddenPayslipMemo, type LedgerViewer } from '#domain/ledger/privacy'
import { BaseTransformer } from '@adonisjs/core/transformers'
import { isoTimestamp } from '#domain/time/iso_timestamp'
import TransactionTransformer from '#transformers/transaction_transformer'

/**
 * A transfer with its two legs (needs `legs` preloaded, with their splits):
 * `amountCents` is positive; the outgoing leg carries it negative on
 * `fromAccountId`, the incoming one positive on `toAccountId`. Each leg is
 * masked like any transaction, and the memo (the legs' note) is withheld
 * while either leg is a private row the reader may not see, or while it is
 * the memo of a payslip whose gross line is (`viewer.hiddenPayslipMemos`).
 */
export default class TransferTransformer extends BaseTransformer<Transfer> {
  constructor(
    resource: Transfer,
    protected viewer: LedgerViewer
  ) {
    super(resource)
  }

  toObject() {
    const transfer = this.resource
    const legs = transfer.legs ?? []
    const masked = legs.some((leg) => isHiddenFrom(leg, this.viewer))
    return {
      id: transfer.id,
      date: transfer.date,
      amountCents: transfer.amountCents,
      fromAccountId: transfer.fromAccountId,
      toAccountId: transfer.toAccountId,
      memo: masked ? null : unlessHiddenPayslipMemo(transfer.memo, transfer.id, this.viewer),
      clientId: transfer.clientId,
      legs: TransactionTransformer.transform(legs, this.viewer),
      createdByUserId: transfer.createdByUserId,
      createdAt: isoTimestamp(transfer.createdAt)!,
      updatedAt: isoTimestamp(transfer.updatedAt)!,
    }
  }
}
