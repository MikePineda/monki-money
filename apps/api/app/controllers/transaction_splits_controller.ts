import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { updateSplitsValidator } from '#validators/transactions'
import { privacyViewer } from '#services/ledger/privacy_viewer'
import TransactionService from '#services/ledger/transaction_service'
import TransactionTransformer from '#transformers/transaction_transformer'

/** The split lines of a transaction. */
@inject()
export default class TransactionSplitsController {
  constructor(protected transactions: TransactionService) {}

  /**
   * PUT /transactions/:id/splits { splits, categoryId? }: the lines must add
   * up to the amount (422 `splits`); no lines = not split anymore.
   */
  async update(ctx: HttpContext) {
    const { params, ...payload } = await ctx.request.validateUsing(updateSplitsValidator)
    const user = ctx.auth.getUserOrFail()

    const transaction = await this.transactions.updateSplits(
      ctx.household,
      user,
      params.id,
      payload
    )

    return ctx.serialize(
      TransactionTransformer.transform(transaction, await privacyViewer(ctx.household, user))
    )
  }
}
