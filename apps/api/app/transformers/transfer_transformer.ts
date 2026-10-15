import type Transfer from '#models/transfer'
import { BaseTransformer } from '@adonisjs/core/transformers'
import { isoTimestamp } from '#domain/time/iso_timestamp'
import TransactionTransformer from '#transformers/transaction_transformer'

/**
 * A transfer with its two legs (needs `legs` preloaded, with their splits):
 * `amountCents` is positive; the outgoing leg carries it negative on
 * `fromAccountId`, the incoming one positive on `toAccountId`.
 */
export default class TransferTransformer extends BaseTransformer<Transfer> {
  constructor(
    resource: Transfer,
    protected viewerUserId: number
  ) {
    super(resource)
  }

  toObject() {
    const transfer = this.resource
    return {
      id: transfer.id,
      date: transfer.date,
      amountCents: transfer.amountCents,
      fromAccountId: transfer.fromAccountId,
      toAccountId: transfer.toAccountId,
      memo: transfer.memo,
      clientId: transfer.clientId,
      legs: TransactionTransformer.transform(transfer.legs ?? [], this.viewerUserId),
      createdByUserId: transfer.createdByUserId,
      createdAt: isoTimestamp(transfer.createdAt)!,
      updatedAt: isoTimestamp(transfer.updatedAt)!,
    }
  }
}
