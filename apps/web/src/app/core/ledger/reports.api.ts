import { Injectable, inject } from '@angular/core'
import { API } from '../api/api'

/**
 * Data access for the ledger reports behind the Month view. Amounts are
 * positive on their own side (`expenseCents` = spent, net of refunds);
 * transfers never count; a partner's private rows show as the `private` bucket.
 */
@Injectable({ providedIn: 'root' })
export class ReportsApi {
  private readonly api = inject(API)

  /** `GET /reports/month?month=YYYY-MM`: totals and lines by group, category and person. */
  async month(month: string) {
    const { data } = await (await this.api()).request('reports.month', { query: { month } })
    return data
  }

  /** `GET /reports/trend`: `months` monthly totals ending at `month`, one series per group. */
  async trend(month: string, months: number) {
    const { data } = await (
      await this.api()
    ).request('reports.trend', { query: { month, months, groupBy: 'group' } })
    return data
  }
}

export type MonthReport = Awaited<ReturnType<ReportsApi['month']>>
export type TrendReport = Awaited<ReturnType<ReportsApi['trend']>>
