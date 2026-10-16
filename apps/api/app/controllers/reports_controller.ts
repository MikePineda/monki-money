import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import ReportService from '#services/reports/report_service'
import { requestLocale } from '#services/http/request_locale'
import {
  categoryReportValidator,
  monthReportValidator,
  trendReportValidator,
} from '#validators/reports'

/**
 * Reports over the ledger. Amounts are positive on their own side
 * (`expenseCents` = spent net of refunds); transfers never count; a
 * partner's private amounts show under the `private` bucket.
 */
@inject()
export default class ReportsController {
  constructor(protected reports: ReportService) {}

  /** GET /reports/month?month=YYYY-MM&paidByUserId= */
  async month(ctx: HttpContext) {
    const input = await ctx.request.validateUsing(monthReportValidator)

    const summary = await this.reports.month(ctx.household, ctx.auth.getUserOrFail(), {
      ...input,
      locale: requestLocale(ctx),
    })

    return { data: summary }
  }

  /** GET /reports/trend?months=6&groupBy=group|category&month=YYYY-MM */
  async trend(ctx: HttpContext) {
    const input = await ctx.request.validateUsing(trendReportValidator)

    const trend = await this.reports.trend(ctx.household, ctx.auth.getUserOrFail(), input)

    return { data: trend }
  }

  /** GET /reports/category/:id?months=6&month=YYYY-MM */
  async category(ctx: HttpContext) {
    const { params, ...input } = await ctx.request.validateUsing(categoryReportValidator)

    const trend = await this.reports.category(
      ctx.household,
      ctx.auth.getUserOrFail(),
      params.id,
      input
    )

    return { data: trend }
  }

  /** GET /reports/balances: cleared and available balance per account. */
  async balances(ctx: HttpContext) {
    return { data: await this.reports.balances(ctx.household) }
  }
}
