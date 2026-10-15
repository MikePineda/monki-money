import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { scanReceiptValidator } from '#validators/receipts'
import ReceiptScanner from '#services/receipts/receipt_scanner'

/** Receipt scanning (any member of the household). */
@inject()
export default class ReceiptsController {
  constructor(protected scanner: ReceiptScanner) {}

  /**
   * POST /receipts/scan (`{ key }` from `POST /uploads/presign`): the
   * transaction draft read from the photo; the photo is deleted afterwards.
   */
  async scan(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(scanReceiptValidator)

    const receipt = await this.scanner.scan(ctx.household, ctx.auth.getUserOrFail(), payload)

    return { data: receipt }
  }
}
