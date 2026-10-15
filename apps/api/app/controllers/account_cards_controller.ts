import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import AccountService from '#services/accounts/account_service'
import { addCardValidator, cardParamsValidator } from '#validators/accounts'
import AccountCardTransformer from '#transformers/account_card_transformer'

/** Cards of an account (by printed suffix), used to attribute imported rows. */
@inject()
export default class AccountCardsController {
  constructor(protected accounts: AccountService) {}

  /** POST /accounts/:id/cards */
  async store(ctx: HttpContext) {
    const { params, ...payload } = await ctx.request.validateUsing(addCardValidator)

    const card = await this.accounts.addCard(ctx.household, params.id, payload)

    ctx.response.status(201)
    return ctx.serialize(AccountCardTransformer.transform(card))
  }

  /** DELETE /accounts/:id/cards/:cardId */
  async destroy(ctx: HttpContext) {
    const { params } = await ctx.request.validateUsing(cardParamsValidator)

    await this.accounts.removeCard(ctx.household, params.id, params.cardId)

    return ctx.response.noContent()
  }
}
