import type TransactionSplit from '#models/transaction_split'
import { BaseTransformer } from '@adonisjs/core/transformers'

/** One line of a split transaction; `amountCents` is signed like the parent. */
export default class TransactionSplitTransformer extends BaseTransformer<TransactionSplit> {
  toObject() {
    return {
      id: this.resource.id,
      categoryId: this.resource.categoryId,
      amountCents: this.resource.amountCents,
      memo: this.resource.memo,
      sortOrder: this.resource.sortOrder,
    }
  }
}
