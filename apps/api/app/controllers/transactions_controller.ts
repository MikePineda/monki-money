import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import TransactionService from '#services/ledger/transaction_service'
import TransactionTransformer from '#transformers/transaction_transformer'
import {
  bulkCategorizeValidator,
  createTransactionValidator,
  listTransactionsValidator,
  quickTransactionValidator,
  transactionParamsValidator,
  updateTransactionValidator,
} from '#validators/transactions'

/** Expenses and income of the current household (any member). */
@inject()
export default class TransactionsController {
  constructor(protected transactions: TransactionService) {}

  /** GET /transactions: filtered, paginated (`{ data, metadata }`, perPage <= 100). */
  async index(ctx: HttpContext) {
    const filters = await ctx.request.validateUsing(listTransactionsValidator)
    const viewer = ctx.auth.getUserOrFail()

    const page = await this.transactions.list(ctx.household, viewer, filters)

    return ctx.serialize(TransactionTransformer.paginate(page.all(), page.getMeta(), viewer.id))
  }

  /** POST /transactions: 201, or 200 with the existing row for a repeated `clientId`. */
  async store(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(createTransactionValidator)
    const viewer = ctx.auth.getUserOrFail()

    const { transaction, created } = await this.transactions.create(ctx.household, viewer, payload)

    ctx.response.status(created ? 201 : 200)
    return ctx.serialize(TransactionTransformer.transform(transaction, viewer.id))
  }

  /** POST /transactions/quick: last account used, today in the household's time zone. */
  async quick(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(quickTransactionValidator)
    const viewer = ctx.auth.getUserOrFail()

    const { transaction, created } = await this.transactions.quick(ctx.household, viewer, payload)

    ctx.response.status(created ? 201 : 200)
    return ctx.serialize(TransactionTransformer.transform(transaction, viewer.id))
  }

  /** GET /transactions/:id */
  async show(ctx: HttpContext) {
    const { params } = await ctx.request.validateUsing(transactionParamsValidator)
    const viewer = ctx.auth.getUserOrFail()

    const transaction = await this.transactions.find(ctx.household, params.id)

    return ctx.serialize(TransactionTransformer.transform(transaction, viewer.id))
  }

  /** PATCH /transactions/:id: 409 for a transfer leg, 403 for the partner's private one. */
  async update(ctx: HttpContext) {
    const { params, ...payload } = await ctx.request.validateUsing(updateTransactionValidator)
    const viewer = ctx.auth.getUserOrFail()

    const transaction = await this.transactions.update(ctx.household, viewer, params.id, payload)

    return ctx.serialize(TransactionTransformer.transform(transaction, viewer.id))
  }

  /** DELETE /transactions/:id */
  async destroy(ctx: HttpContext) {
    const { params } = await ctx.request.validateUsing(transactionParamsValidator)

    await this.transactions.destroy(ctx.household, ctx.auth.getUserOrFail(), params.id)

    return ctx.response.noContent()
  }

  /** POST /transactions/bulk-categorize { ids, categoryId }: `{ updated, skipped }`. */
  async bulkCategorize(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(bulkCategorizeValidator)

    const result = await this.transactions.bulkCategorize(
      ctx.household,
      ctx.auth.getUserOrFail(),
      payload
    )

    return { data: result }
  }
}
