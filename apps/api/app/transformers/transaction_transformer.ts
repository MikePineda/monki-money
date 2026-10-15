import type Transaction from '#models/transaction'
import { isHiddenFrom, type PrivacyViewer } from '#domain/ledger/privacy'
import { BaseTransformer } from '@adonisjs/core/transformers'
import { isoTimestamp } from '#domain/time/iso_timestamp'
import TransactionSplitTransformer from '#transformers/transaction_split_transformer'

/**
 * A ledger row as `viewer` may see it (needs `splits` preloaded).
 * `amountCents` is signed: negative = money out.
 *
 * Privacy: a partner's private transaction keeps its amount, date,
 * account, payer and kind, but its payee, notes, bank description, tags,
 * category and split lines are withheld and it never shows as "needs
 * review" (`isMasked: true`), so the app shows it as "Private".
 */
export default class TransactionTransformer extends BaseTransformer<Transaction> {
  constructor(
    resource: Transaction,
    protected viewer: PrivacyViewer
  ) {
    super(resource)
  }

  toObject() {
    const transaction = this.resource
    const masked = isHiddenFrom(transaction, this.viewer)

    return {
      id: transaction.id,
      accountId: transaction.accountId,
      kind: transaction.kind,
      date: transaction.date,
      bankDate: transaction.bankDate,
      amountCents: transaction.amountCents,
      currencyCode: transaction.currencyCode,
      payee: masked ? null : transaction.payee,
      description: masked ? null : transaction.description,
      rawDescription: masked ? null : transaction.rawDescription,
      categoryId: masked ? null : transaction.categoryId,
      isSplit: masked ? false : transaction.isSplit,
      splits: TransactionSplitTransformer.transform(masked ? [] : (transaction.splits ?? [])),
      transferId: transaction.transferId,
      paidByUserId: transaction.paidByUserId,
      status: transaction.status,
      source: transaction.source,
      needsReview: masked ? false : transaction.needsReview,
      cardSuffix: transaction.cardSuffix,
      clientId: transaction.clientId,
      isPrivate: transaction.isPrivate,
      isMasked: masked,
      tags: masked ? [] : transaction.tags,
      createdByUserId: transaction.createdByUserId,
      updatedByUserId: transaction.updatedByUserId,
      createdAt: isoTimestamp(transaction.createdAt)!,
      updatedAt: isoTimestamp(transaction.updatedAt)!,
    }
  }
}
