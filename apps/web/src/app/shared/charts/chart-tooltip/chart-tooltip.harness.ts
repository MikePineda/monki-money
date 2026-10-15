import { ComponentHarness } from '@angular/cdk/testing'

export interface TooltipRowContent {
  value: string
  label: string
}

export class ChartTooltipHarness extends ComponentHarness {
  static hostSelector = 'app-chart-tooltip'

  async getHeading(): Promise<string | null> {
    const heading = await this.locatorForOptional('[data-tooltip-heading]')()
    return heading ? heading.text() : null
  }

  /** Rows in display order: the value leads, the series label follows. */
  async getRows(): Promise<TooltipRowContent[]> {
    const [values, labels] = await Promise.all([
      this.locatorForAll('[data-tooltip-row] [data-tooltip-value]')(),
      this.locatorForAll('[data-tooltip-row] [data-tooltip-label]')(),
    ])
    return Promise.all(
      values.map(async (value, index) => ({
        value: await value.text(),
        label: (await labels[index]?.text()) ?? '',
      }))
    )
  }

  /** Which side of its anchor the tooltip sits on. */
  async getSide(): Promise<string | null> {
    return (await this.host()).getAttribute('data-side')
  }
}
