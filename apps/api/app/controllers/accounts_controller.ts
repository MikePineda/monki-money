import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import AccountService from '#services/accounts/account_service'
import AccountTransformer from '#transformers/account_transformer'
import { reorderValidator } from '#validators/reorder'
import {
  accountParamsValidator,
  createAccountValidator,
  updateAccountValidator,
} from '#validators/accounts'

/** Accounts of the current household (any member). */
@inject()
export default class AccountsController {
  constructor(protected accounts: AccountService) {}

  /** GET /accounts: with cards and cleared/available balances. */
  async index(ctx: HttpContext) {
    const { accounts, balances } = await this.accounts.list(ctx.household)
    return ctx.serialize(AccountTransformer.transform(accounts, balances))
  }

  /** POST /accounts */
  async store(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(createAccountValidator)

    const { account, balances } = await this.accounts.create(
      ctx.household,
      ctx.auth.getUserOrFail(),
      payload
    )

    ctx.response.status(201)
    return ctx.serialize(AccountTransformer.transform(account, balances))
  }

  /** GET /accounts/:id */
  async show(ctx: HttpContext) {
    const { params } = await ctx.request.validateUsing(accountParamsValidator)

    const { account, balances } = await this.accounts.find(ctx.household, params.id)

    return ctx.serialize(AccountTransformer.transform(account, balances))
  }

  /** PATCH /accounts/:id */
  async update(ctx: HttpContext) {
    const { params, ...payload } = await ctx.request.validateUsing(updateAccountValidator)

    const { account, balances } = await this.accounts.update(ctx.household, params.id, payload)

    return ctx.serialize(AccountTransformer.transform(account, balances))
  }

  /** DELETE /accounts/:id: 409 while it has transactions. */
  async destroy(ctx: HttpContext) {
    const { params } = await ctx.request.validateUsing(accountParamsValidator)

    await this.accounts.delete(ctx.household, params.id)

    return ctx.response.noContent()
  }

  /** PUT /accounts/reorder { ids } */
  async reorder(ctx: HttpContext) {
    const { ids } = await ctx.request.validateUsing(reorderValidator)

    await this.accounts.reorder(ctx.household, ids)

    return ctx.response.noContent()
  }
}
