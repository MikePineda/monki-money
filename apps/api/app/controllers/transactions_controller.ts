import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import TagEditor from '#services/ledger/tag_editor'
import { ledgerViewer, privacyViewer } from '#services/ledger/privacy_viewer'
import TransactionService from '#services/ledger/transaction_service'
import TransactionSuggestions from '#services/ledger/transaction_suggestions'
import TransactionTransformer from '#transformers/transaction_transformer'
import {
  bulkCategorizeValidator,
  bulkTagsValidator,
  createTransactionValidator,
  listTransactionsValidator,
  quickTransactionValidator,
  transactionParamsValidator,
  updateTransactionValidator,
} from '#validators/transactions'

/** Expenses and income of the current household (any member). */
@inject()
export default class TransactionsController {
  constructor(
    protected transactions: TransactionService,
    protected suggestionsFor: TransactionSuggestions,
    protected tags: TagEditor
  ) {}

  /**
   * GET /transactions/suggestions: quick add's categories, payees, transfer
   * routes and last account for the reader, ranked on the server.
   */
  async suggestions(ctx: HttpContext) {
    return { data: await this.suggestionsFor.for(ctx.household, ctx.auth.getUserOrFail()) }
  }

  /** GET /transactions: filtered, paginated (`{ data, metadata }`, perPage <= 100). */
  async index(ctx: HttpContext) {
    const filters = await ctx.request.validateUsing(listTransactionsValidator)
    const user = ctx.auth.getUserOrFail()

    const page = await this.transactions.list(
      ctx.household,
      await privacyViewer(ctx.household, user),
      filters
    )
    const rows = page.all()
    const viewer = await ledgerViewer(
      ctx.household,
      user,
      rows.map((row) => row.transferId)
    )

    return ctx.serialize(TransactionTransformer.paginate(rows, page.getMeta(), viewer))
  }

  /** POST /transactions: 201, or 200 with the existing row for a repeated `clientId`. */
  async store(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(createTransactionValidator)
    const user = ctx.auth.getUserOrFail()

    const { transaction, created } = await this.transactions.create(ctx.household, user, payload)

    ctx.response.status(created ? 201 : 200)
    return ctx.serialize(
      TransactionTransformer.transform(transaction, await privacyViewer(ctx.household, user))
    )
  }

  /** POST /transactions/quick: last account used, today in the household's time zone. */
  async quick(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(quickTransactionValidator)
    const user = ctx.auth.getUserOrFail()

    const { transaction, created } = await this.transactions.quick(ctx.household, user, payload)

    ctx.response.status(created ? 201 : 200)
    return ctx.serialize(
      TransactionTransformer.transform(transaction, await privacyViewer(ctx.household, user))
    )
  }

  /** GET /transactions/:id */
  async show(ctx: HttpContext) {
    const { params } = await ctx.request.validateUsing(transactionParamsValidator)

    const transaction = await this.transactions.find(ctx.household, params.id)

    const viewer = await ledgerViewer(ctx.household, ctx.auth.getUserOrFail(), [
      transaction.transferId,
    ])
    return ctx.serialize(TransactionTransformer.transform(transaction, viewer))
  }

  /** PATCH /transactions/:id: 409 for a transfer leg, 403 for the partner's private one. */
  async update(ctx: HttpContext) {
    const { params, ...payload } = await ctx.request.validateUsing(updateTransactionValidator)
    const user = ctx.auth.getUserOrFail()

    const transaction = await this.transactions.update(ctx.household, user, params.id, payload)

    return ctx.serialize(
      TransactionTransformer.transform(transaction, await privacyViewer(ctx.household, user))
    )
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

  /**
   * POST /transactions/bulk-tags { ids, add, remove }: `{ updated, skipped }`
   * (a transfer leg changes both legs; the partner's private rows are skipped).
   */
  async bulkTags(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(bulkTagsValidator)

    const result = await this.tags.bulk(ctx.household, ctx.auth.getUserOrFail(), payload)

    return { data: result }
  }
}
