import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import TransferService from '#services/ledger/transfer_service'
import { ledgerViewer } from '#services/ledger/privacy_viewer'
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
    const user = ctx.auth.getUserOrFail()

    const { transfer, created } = await this.transfers.create(ctx.household, user, payload)

    ctx.response.status(created ? 201 : 200)
    return ctx.serialize(
      TransferTransformer.transform(
        transfer,
        await ledgerViewer(ctx.household, user, [transfer.id])
      )
    )
  }

  /** GET /transfers/:id: both legs (masked for the reader) and the memo in one call. */
  async show(ctx: HttpContext) {
    const { params } = await ctx.request.validateUsing(transferParamsValidator)

    const transfer = await this.transfers.find(ctx.household, params.id)

    const viewer = await ledgerViewer(ctx.household, ctx.auth.getUserOrFail(), [transfer.id])
    return ctx.serialize(TransferTransformer.transform(transfer, viewer))
  }

  /** PATCH /transfers/:id: both legs follow (403 for the partner's private one). */
  async update(ctx: HttpContext) {
    const { params, ...payload } = await ctx.request.validateUsing(updateTransferValidator)
    const user = ctx.auth.getUserOrFail()

    const transfer = await this.transfers.update(ctx.household, user, params.id, payload)

    return ctx.serialize(
      TransferTransformer.transform(
        transfer,
        await ledgerViewer(ctx.household, user, [transfer.id])
      )
    )
  }

  /** DELETE /transfers/:id: removes both legs (403 for the partner's private one). */
  async destroy(ctx: HttpContext) {
    const { params } = await ctx.request.validateUsing(transferParamsValidator)

    await this.transfers.destroy(ctx.household, ctx.auth.getUserOrFail(), params.id)

    return ctx.response.noContent()
  }
}
