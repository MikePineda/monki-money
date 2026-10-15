import { ComponentHarness } from '@angular/cdk/testing'
import { ChartTooltipHarness } from '../chart-tooltip/chart-tooltip.harness'

export class TrendLineHarness extends ComponentHarness {
  static hostSelector = 'app-trend-line'

  private readonly plot = this.locatorFor('[data-chart-interactive]')

  /** Marker centres of one series, in drawing order. */
  async getMarkerXs(seriesId: string): Promise<number[]> {
    const markers = await this.locatorForAll(`[data-series="${seriesId}"] circle`)()
    return Promise.all(markers.map(async (marker) => Number(await marker.getAttribute('cx'))))
  }

  /** Moves a pointer to an x position inside the plot. */
  async pointAt(x: number, pointerType: 'mouse' | 'touch' = 'mouse'): Promise<void> {
    await (await this.plot()).dispatchEvent('pointermove', { clientX: x, pointerType })
  }

  async leave(pointerType: 'mouse' | 'touch' = 'mouse'): Promise<void> {
    await (await this.plot()).dispatchEvent('pointerleave', { pointerType })
  }

  async focus(): Promise<void> {
    await (await this.plot()).focus()
  }

  async blur(): Promise<void> {
    await (await this.plot()).blur()
  }

  async pressKey(key: string): Promise<void> {
    await (await this.plot()).dispatchEvent('keydown', { key })
  }

  async getCrosshairX(): Promise<number | null> {
    const crosshair = await this.locatorForOptional('line.crosshair')()
    return crosshair ? Number(await crosshair.getAttribute('x1')) : null
  }

  async getTooltip(): Promise<ChartTooltipHarness | null> {
    return this.locatorForOptional(ChartTooltipHarness)()
  }

  /** The text that names the image for assistive technology, whitespace collapsed. */
  async getSummary(): Promise<string> {
    const text = await (await this.locatorFor('[data-chart-summary]')()).text()
    return text.replace(/\s+/g, ' ').trim()
  }

  async getTickLabels(): Promise<string[]> {
    return this.texts('text.tick-label')
  }

  async getXLabels(): Promise<string[]> {
    return this.texts('text.x-label')
  }

  async getEndLabels(): Promise<string[]> {
    return this.texts('text.value-label')
  }

  async getLegendLabels(): Promise<string[]> {
    return this.texts('[data-legend-label]')
  }

  private async texts(selector: string): Promise<string[]> {
    return Promise.all((await this.locatorForAll(selector)()).map((element) => element.text()))
  }
}
