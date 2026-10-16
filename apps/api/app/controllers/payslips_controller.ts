import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { privacyViewer } from '#services/ledger/privacy_viewer'
import PayslipService from '#services/payslips/payslip_service'
import PayslipTransformer from '#transformers/payslip_transformer'
import {
  createPayslipValidator,
  listPayslipsValidator,
  payslipCandidatesValidator,
  payslipParamsValidator,
} from '#validators/payslips'

/**
 * Payslips of the current household (any member): a payout recorded as
 * its gross and deductions in the account it arrived in, linked to the
 * transfer that took the net to the bank. No update: delete and record
 * it again.
 */
@inject()
export default class PayslipsController {
  constructor(protected payslips: PayslipService) {}

  /** GET /payslips?accountId=: newest first, with their rows and transfer. */
  async index(ctx: HttpContext) {
    const filters = await ctx.request.validateUsing(listPayslipsValidator)
    const user = ctx.auth.getUserOrFail()

    const payslips = await this.payslips.list(ctx.household, filters)

    return ctx.serialize(
      PayslipTransformer.transform(payslips, await privacyViewer(ctx.household, user))
    )
  }

  /**
   * POST /payslips: the gross, its deductions and the transfer, in one DB
   * transaction. 201, or 200 with the existing payslip for a repeated `clientId`.
   */
  async store(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(createPayslipValidator)
    const user = ctx.auth.getUserOrFail()

    const { payslip, created } = await this.payslips.create(ctx.household, user, payload)

    ctx.response.status(created ? 201 : 200)
    return ctx.serialize(
      PayslipTransformer.transform(payslip, await privacyViewer(ctx.household, user))
    )
  }

  /** GET /payslips/candidates?accountId=: transfers leaving the account no payslip explains. */
  async candidates(ctx: HttpContext) {
    const { accountId } = await ctx.request.validateUsing(payslipCandidatesValidator)

    const candidates = await this.payslips.candidates(ctx.household, accountId)

    return { data: candidates }
  }

  /** DELETE /payslips/:id: its rows go, the transfer stays (unlinked); 403 over a partner's private row. */
  async destroy(ctx: HttpContext) {
    const { params } = await ctx.request.validateUsing(payslipParamsValidator)

    await this.payslips.destroy(ctx.household, ctx.auth.getUserOrFail(), params.id)

    return ctx.response.noContent()
  }
}
