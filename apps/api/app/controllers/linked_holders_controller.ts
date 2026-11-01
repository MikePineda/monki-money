import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import LinkedHolders from '#services/imports/linked_holders'
import { linkedHolderParamsValidator } from '#validators/household'
import LinkedHolderTransformer from '#transformers/linked_holder_transformer'

/**
 * Where each linked holder's internal transfers go (`linked_holder_accounts`,
 * learned when an import is confirmed): any member sees them and forgets a
 * wrong pair, like merchant rules.
 */
@inject()
export default class LinkedHoldersController {
  constructor(protected holders: LinkedHolders) {}

  /** GET /household/linked-holders: every holder with its accounts. */
  async index(ctx: HttpContext) {
    const holders = await this.holders.summaries(ctx.household)

    return ctx.serialize(LinkedHolderTransformer.transform(holders))
  }

  /** DELETE /household/linked-holders/:id: forgets one (holder, account) pair; 204. */
  async destroy(ctx: HttpContext) {
    const { params } = await ctx.request.validateUsing(linkedHolderParamsValidator)

    await this.holders.forget(ctx.household, params.id)

    return ctx.response.noContent()
  }
}
