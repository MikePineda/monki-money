import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import TransferService from '#services/ledger/transfer_service'
import TransferTransformer from '#transformers/transfer_transformer'
import {
  createTransferValidator,
  transferParamsValidator,
  updateTransferValidator,
} from '#validators/transfers'

/** Transfers between two accounts of the household (two legs each). */
@inject()
export default class TransfersController {
  constructor(protected transfers: TransferService) {}

  /** POST /transfers: 201, or 200 with the existing transfer for a repeated `clientId`. */
  async store(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(createTransferValidator)
    const viewer = ctx.auth.getUserOrFail()

    const { transfer, created } = await this.transfers.create(ctx.household, viewer, payload)

    ctx.response.status(created ? 201 : 200)
    return ctx.serialize(TransferTransformer.transform(transfer, viewer.id))
  }

  /** PATCH /transfers/:id: both legs follow. */
  async update(ctx: HttpContext) {
    const { params, ...payload } = await ctx.request.validateUsing(updateTransferValidator)
    const viewer = ctx.auth.getUserOrFail()

    const transfer = await this.transfers.update(ctx.household, viewer, params.id, payload)

    return ctx.serialize(TransferTransformer.transform(transfer, viewer.id))
  }

  /** DELETE /transfers/:id: removes both legs. */
  async destroy(ctx: HttpContext) {
    const { params } = await ctx.request.validateUsing(transferParamsValidator)

    await this.transfers.destroy(ctx.household, params.id)

    return ctx.response.noContent()
  }
}
