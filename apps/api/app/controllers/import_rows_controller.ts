import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { decideRowValidator, decideRowsValidator } from '#validators/imports'
import ImportService from '#services/imports/import_service'
import { privacyViewer } from '#services/ledger/privacy_viewer'
import ImportRowTransformer from '#transformers/import_row_transformer'

/** A person's decisions on the rows of a staged import, one row or several at once. */
@inject()
export default class ImportRowsController {
  constructor(protected imports: ImportService) {}

  /**
   * PATCH /imports/:id/rows/:rowId: `{ resolution?, categoryId?, splits?,
   * transferAccountId?, matchTransactionId?, paidByUserId?, payee?, learnRule? }`.
   */
  async update(ctx: HttpContext) {
    const { params, ...decision } = await ctx.request.validateUsing(decideRowValidator)
    const user = ctx.auth.getUserOrFail()

    const row = await this.imports.decide(ctx.household, user, params.id, params.rowId, decision)
    await row.load('matchTransaction')
    await row.load('transaction')

    return ctx.serialize(
      ImportRowTransformer.transform(row, await privacyViewer(ctx.household, user))
    )
  }

  /**
   * PATCH /imports/:id/rows: `{ changes: [{ rowId, reset?, ...same fields as
   * one row }] }`, all applied in one transaction (all or nothing); answers
   * the changed rows in file order.
   */
  async updateMany(ctx: HttpContext) {
    const { params, changes } = await ctx.request.validateUsing(decideRowsValidator)
    const user = ctx.auth.getUserOrFail()

    const rows = await this.imports.decideMany(ctx.household, user, params.id, changes)

    return ctx.serialize(
      ImportRowTransformer.transform(rows, await privacyViewer(ctx.household, user))
    )
  }
}
