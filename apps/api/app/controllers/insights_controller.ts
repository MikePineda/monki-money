import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { requestLocale } from '#services/http/request_locale'
import InsightService from '#services/insights/insight_service'
import MonthlyInsightTransformer from '#transformers/monthly_insight_transformer'
import { generateInsightValidator, insightParamsValidator } from '#validators/insights'

/** LLM-written monthly summaries of the current household, in the reader's language. */
@inject()
export default class InsightsController {
  constructor(protected insights: InsightService) {}

  /** GET /insights/:month: 404 until generated in this language. */
  async show(ctx: HttpContext) {
    const { params } = await ctx.request.validateUsing(insightParamsValidator)

    const insight = await this.insights.find(ctx.household, params.month, requestLocale(ctx))

    return ctx.serialize(MonthlyInsightTransformer.transform(insight))
  }

  /** POST /insights/:month/generate { force? }: 201 written now, 200 the stored one. */
  async generate(ctx: HttpContext) {
    const { params, force } = await ctx.request.validateUsing(generateInsightValidator)

    const { insight, fresh } = await this.insights.generate(
      ctx.household,
      ctx.auth.getUserOrFail(),
      params.month,
      requestLocale(ctx),
      { force }
    )

    ctx.response.status(fresh ? 201 : 200)
    return ctx.serialize(
      MonthlyInsightTransformer.transform(insight, fresh).useVariant('toGenerated')
    )
  }
}
