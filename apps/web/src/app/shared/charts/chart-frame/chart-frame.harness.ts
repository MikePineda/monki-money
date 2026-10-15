import { ComponentHarness, HarnessPredicate, type BaseHarnessFilters } from '@angular/cdk/testing'

export interface ChartFrameHarnessFilters extends BaseHarnessFilters {
  title?: string | RegExp
}

export interface ChartTableContent {
  caption: string
  headers: string[]
  rows: string[][]
  total: string[] | null
}

export class ChartFrameHarness extends ComponentHarness {
  static hostSelector = 'app-chart-frame'

  static with(options: ChartFrameHarnessFilters = {}): HarnessPredicate<ChartFrameHarness> {
    return new HarnessPredicate(ChartFrameHarness, options).addOption(
      'title',
      options.title,
      (harness, title) => HarnessPredicate.stringMatches(harness.getTitle(), title)
    )
  }

  private readonly tableToggle = this.locatorForOptional('button[data-chart-toggle]')

  async getTitle(): Promise<string> {
    return (await this.locatorFor('h2')()).text()
  }

  async getSubtitle(): Promise<string | null> {
    const subtitle = await this.locatorForOptional('[data-chart-subtitle]')()
    return subtitle ? subtitle.text() : null
  }

  async getState(): Promise<string | null> {
    return (await this.host()).getAttribute('data-state')
  }

  async canToggleTable(): Promise<boolean> {
    return (await this.tableToggle()) !== null
  }

  async toggleTable(): Promise<void> {
    const toggle = await this.tableToggle()
    if (!toggle) {
      throw new Error('This chart frame has no table toggle in its current state')
    }
    await toggle.click()
  }

  async isShowingTable(): Promise<boolean> {
    return (await this.locatorForOptional('table')()) !== null
  }

  async isPlotVisible(): Promise<boolean> {
    const plot = await this.locatorForOptional('[data-chart-plot]')()
    return plot !== null && (await plot.getProperty<boolean>('hidden')) === false
  }

  async isBusy(): Promise<boolean> {
    const body = await this.locatorForOptional('[data-chart-body]')()
    return body !== null && (await body.getAttribute('aria-busy')) === 'true'
  }

  async getTable(): Promise<ChartTableContent> {
    const caption = await (await this.locatorFor('table caption')()).text()
    const headers = await Promise.all(
      (await this.locatorForAll('thead th')()).map((cell) => cell.text())
    )
    return {
      caption,
      headers,
      rows: await this.rowCells('tbody tr'),
      total: (await this.rowCells('tfoot tr'))[0] ?? null,
    }
  }

  async getMessage(): Promise<string | null> {
    const message = await this.locatorForOptional('[data-chart-message]')()
    return message ? message.text() : null
  }

  async retry(): Promise<void> {
    await (await this.locatorFor('button[data-chart-retry]')()).click()
  }

  async getFootnote(): Promise<string | null> {
    const footnote = await this.locatorForOptional('[data-chart-footnote]')()
    return footnote ? footnote.text() : null
  }

  /** Text of each header and data cell, row by row. */
  private async rowCells(selector: string): Promise<string[][]> {
    const cells = await this.locatorForAll(`${selector} > th, ${selector} > td`)()
    const rows: string[][] = []
    for (const cell of cells) {
      const isRowStart = (await cell.getAttribute('scope')) === 'row'
      if (isRowStart || rows.length === 0) {
        rows.push([])
      }
      rows.at(-1)?.push(await cell.text())
    }
    return rows
  }
}
