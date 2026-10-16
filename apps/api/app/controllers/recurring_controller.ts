import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import RecurringService from '#services/recurring/recurring_service'
import RecurringItemTransformer from '#transformers/recurring_item_transformer'
import {
  createRecurringValidator,
  recurringParamsValidator,
  updateRecurringValidator,
} from '#validators/recurring'

/** Recurring payments of the current household (any member). */
@inject()
export default class RecurringController {
  constructor(protected recurring: RecurringService) {}

  /** GET /recurring: active first, then paused and dismissed; each by next due date. */
  async index(ctx: HttpContext) {
    const items = await this.recurring.list(ctx.household)

    return ctx.serialize(RecurringItemTransformer.transform(items))
  }

  /** POST /recurring: a recurring payment typed by a person. */
  async store(ctx: HttpContext) {
    const payload = await ctx.request.validateUsing(createRecurringValidator)

    const item = await this.recurring.create(ctx.household, payload)

    ctx.response.status(201)
    return ctx.serialize(RecurringItemTransformer.transform(item))
  }

  /** POST /recurring/detect: finds recurring payments in the last twelve months. */
  async detect(ctx: HttpContext) {
    const result = await this.recurring.detect(ctx.household)

    return { data: result }
  }

  /** PATCH /recurring/:id: amount, cadence, category, account, payer, next date, status. */
  async update(ctx: HttpContext) {
    const { params, ...payload } = await ctx.request.validateUsing(updateRecurringValidator)

    const item = await this.recurring.update(ctx.household, params.id, payload)

    return ctx.serialize(RecurringItemTransformer.transform(item))
  }

  /** DELETE /recurring/:id */
  async destroy(ctx: HttpContext) {
    const { params } = await ctx.request.validateUsing(recurringParamsValidator)

    await this.recurring.destroy(ctx.household, params.id)

    return ctx.response.noContent()
  }
}
