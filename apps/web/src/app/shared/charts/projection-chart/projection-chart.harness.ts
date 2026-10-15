import { TrendLineHarness } from '../trend-line/trend-line.harness'

/**
 * The projection chart shares the line charts' DOM contract (markers per
 * series group, crosshair, tooltip, summary); actual months are the
 * `actual` series.
 */
export class ProjectionChartHarness extends TrendLineHarness {
  static override hostSelector = 'app-projection-chart'

  async getNote(): Promise<string | null> {
    const note = await this.locatorForOptional('[data-projection-note]')()
    return note ? note.text() : null
  }
}
