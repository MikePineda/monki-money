import { inject } from '@adonisjs/core'
import { isLocale } from '@monkimoney/shared'
import type { HttpContext } from '@adonisjs/core/http'
import InsightService from '#services/insights/insight_service'
import MonthlyInsightTransformer from '#transformers/monthly_insight_transformer'
import { generateInsightValidator, insightParamsValidator } from '#validators/insights'

/** The request's language (user -> Accept-Language -> household -> default). */
function localeOf(ctx: HttpContext) {
  return isLocale(ctx.i18n.locale) ? ctx.i18n.locale : 'en'
}

/** LLM-written monthly summaries of the current household, in the reader's language. */
@inject()
export default class InsightsController {
  constructor(protected insights: InsightService) {}

  /** GET /insights/:month: 404 until generated in this language. */
  async show(ctx: HttpContext) {
    const { params } = await ctx.request.validateUsing(insightParamsValidator)

    const insight = await this.insights.find(ctx.household, params.month, localeOf(ctx))

    return ctx.serialize(MonthlyInsightTransformer.transform(insight))
  }

  /** POST /insights/:month/generate { force? }: 201 written now, 200 the stored one. */
  async generate(ctx: HttpContext) {
    const { params, force } = await ctx.request.validateUsing(generateInsightValidator)

    const { insight, fresh } = await this.insights.generate(
      ctx.household,
      ctx.auth.getUserOrFail(),
      params.month,
      localeOf(ctx),
      { force }
    )

    ctx.response.status(fresh ? 201 : 200)
    return ctx.serialize(
      MonthlyInsightTransformer.transform(insight, fresh).useVariant('toGenerated')
    )
  }
}
