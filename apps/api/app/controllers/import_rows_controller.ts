import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { decideRowValidator } from '#validators/imports'
import ImportService from '#services/imports/import_service'
import { privacyViewer } from '#services/ledger/privacy_viewer'
import ImportRowTransformer from '#transformers/import_row_transformer'

/** A person's decision on one row of a staged import. */
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

    return ctx.serialize(
      ImportRowTransformer.transform(row, await privacyViewer(ctx.household, user))
    )
  }
}
