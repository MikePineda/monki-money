import { Component, computed, forwardRef, inject, input } from '@angular/core'
import { TranslocoPipe, translateSignal } from '@jsverse/transloco'
import { chartColorVar, seriesColor, type ChartColor } from '../../../domain/charts/colors'
import { compactMoney, monthText } from '../../../domain/charts/format'
import { layoutLine, placeEndLabel, xLabelIndices } from '../../../domain/charts/line'
import { formatMoney } from '../../../domain/money'
import { APP_LOCALE } from '../../ui/app-locale.token'
import { ChartLegendComponent, type LegendItem } from '../chart-legend/chart-legend.component'
import { ChartTableSource, type ChartTable } from '../chart-table'
import { ChartTooltipComponent, type TooltipRow } from '../chart-tooltip/chart-tooltip.component'
import { provideChartsI18n } from '../charts-i18n'
import { Crosshair } from '../crosshair'
import { injectHostWidth } from '../host-width'

export interface TrendSeries {
  id: string
  label: string
  /** Entity colour; one series defaults to neutral, several to series-1..8 in order. */
  color?: ChartColor
}

export interface TrendDatum {
  /** 'YYYY-MM'. */
  x: string
  /** One value per series id; a missing or null value is a gap. */
  series: readonly { id: string; valueCents: number | null }[]
}

/** End labels closer than this would collide; the legend and tooltip carry them. */
const END_LABEL_GAP = 16

let nextTrendId = 0

/**
 * Keys read from TypeScript, relative to the charts scope (markers for
 * transloco-keys-manager, which cannot see keys held in variables):
 * t(charts.table.month, charts.table.total)
 */
const TABLE_KEYS = ['table.month', 'table.total']

/**
 * Month trend (DESIGN.md, "Tendencia · 6 meses"): 2px lines with ringed
 * markers on every month, one value axis from $0 with compact ticks on
 * solid hairline gridlines, month labels below, and the latest value
 * labelled at the end of each line when the labels do not collide. Hover,
 * touch or keyboard moves a crosshair that snaps to the nearest month and
 * a tooltip lists every series there. Two or more series get a legend.
 */
@Component({
  selector: 'app-trend-line',
  imports: [ChartLegendComponent, ChartTooltipComponent, TranslocoPipe],
  providers: [
    provideChartsI18n(),
    { provide: ChartTableSource, useExisting: forwardRef(() => TrendLineComponent) },
  ],
  template: `
    @if (legend().length > 1) {
      <app-chart-legend [items]="legend()" />
    }
    <div
      data-chart-interactive
      class="plot relative"
      tabindex="0"
      role="group"
      [attr.aria-label]="'charts.trend.explore' | transloco"
      (pointermove)="crosshair.point($event)"
      (pointerdown)="crosshair.point($event)"
      (pointerleave)="crosshair.leave($event)"
      (keydown)="crosshair.key($event)"
      (focus)="crosshair.focus()"
      (blur)="crosshair.clear()"
    >
      <svg
        role="img"
        class="block"
        [attr.aria-labelledby]="summaryId"
        [attr.width]="width()"
        [attr.height]="height()"
        [attr.viewBox]="'0 0 ' + width() + ' ' + height()"
      >
        @for (tick of ticks(); track tick.value) {
          <line
            x1="0"
            [class]="tick.value === 0 ? 'baseline' : 'gridline'"
            [attr.x2]="width()"
            [attr.y1]="tick.y"
            [attr.y2]="tick.y"
          />
          <text class="tick-label" x="0" [attr.y]="tick.y - 4">{{ tick.text }}</text>
        }
        @for (label of xLabels(); track label.index) {
          <text class="x-label" text-anchor="middle" [attr.x]="label.x" [attr.y]="height() - 8">
            {{ label.text }}
          </text>
        }
        @if (crosshairX(); as x) {
          <line
            class="crosshair"
            [attr.x1]="x"
            [attr.x2]="x"
            [attr.y1]="layout().plot.top"
            [attr.y2]="layout().plot.bottom"
          />
        }
        @for (line of lines(); track line.id) {
          <g [attr.data-series]="line.id">
            <path class="series-line" [attr.d]="line.path" [style.stroke]="line.color" />
            @for (point of line.points; track point.index) {
              <circle
                class="marker"
                [attr.cx]="point.x"
                [attr.cy]="point.y"
                [attr.r]="point.index === crosshair.active() ? 5 : 4"
                [style.fill]="line.color"
              />
            }
          </g>
        }
        @for (label of endLabels(); track label.id) {
          <text class="value-label" text-anchor="end" [attr.x]="label.x" [attr.y]="label.y">
            {{ label.text }}
          </text>
        }
      </svg>
      <p hidden data-chart-summary [id]="summaryId">
        @for (item of summaries(); track item.id) {
          {{ 'charts.trend.series' | transloco: item.params }}
        }
      </p>
      <div aria-live="polite">
        @if (tooltip(); as tip) {
          <app-chart-tooltip
            [heading]="tip.heading"
            [rows]="tip.rows"
            [anchorX]="tip.x"
            [containerWidth]="width()"
          />
        }
      </div>
    </div>
  `,
  styleUrl: './trend-line.component.scss',
  host: { class: 'flex flex-col gap-3' },
})
export class TrendLineComponent implements ChartTableSource {
  private readonly locale = inject(APP_LOCALE)

  readonly series = input.required<readonly TrendSeries[]>()
  readonly data = input.required<readonly TrendDatum[]>()
  /** Total SVG height in px, month labels included. */
  readonly height = input(180)
  /** Label each line's latest value (DESIGN.md: the current month). */
  readonly showEndLabels = input(true)

  protected readonly width = injectHostWidth()
  protected readonly summaryId = `trend-summary-${nextTrendId++}`

  private readonly colors = computed<ChartColor[]>(() => {
    const series = this.series()
    return series.map(
      (entry, index) => entry.color ?? (series.length === 1 ? 'neutral' : seriesColor(index))
    )
  })

  /** Values per series, aligned with the months. */
  private readonly values = computed(() =>
    this.series().map((entry) =>
      this.data().map(
        (datum) => datum.series.find((value) => value.id === entry.id)?.valueCents ?? null
      )
    )
  )

  protected readonly layout = computed(() =>
    layoutLine(
      this.series().map((entry, index) => ({ id: entry.id, values: this.values()[index] ?? [] })),
      { width: this.width(), height: this.height() }
    )
  )

  protected readonly crosshair = new Crosshair(() => this.layout().xs)

  protected readonly ticks = computed(() =>
    this.layout().ticks.map((tick) => ({ ...tick, text: compactMoney(tick.value, this.locale()) }))
  )

  protected readonly xLabels = computed(() => {
    const { xs, plot } = this.layout()
    return xLabelIndices(xs.length, plot.right - plot.left).map((index) => ({
      index,
      x: xs[index] ?? 0,
      text: monthText(this.data()[index]?.x ?? '', this.locale()),
    }))
  })

  protected readonly lines = computed(() =>
    this.layout().series.map((line, index) => ({
      ...line,
      color: chartColorVar(this.colors()[index] ?? 'neutral'),
    }))
  )

  protected readonly legend = computed<LegendItem[]>(() =>
    this.series().map((entry, index) => ({
      id: entry.id,
      label: entry.label,
      color: this.colors()[index] ?? 'neutral',
      key: 'line',
    }))
  )

  protected readonly endLabels = computed(() => {
    if (!this.showEndLabels()) {
      return []
    }
    const ends = this.layout().series.flatMap((line) => {
      const last = line.points.at(-1)
      return last ? [{ id: line.id, last }] : []
    })
    const ys = ends.map((end) => end.last.y).sort((a, b) => a - b)
    const collide = ys.some((y, index) => index > 0 && y - (ys[index - 1] ?? y) < END_LABEL_GAP)
    if (collide) {
      return []
    }
    return ends.map(({ id, last }) => ({
      id,
      x: last.x + 4,
      y: placeEndLabel(last.y).y,
      text: formatMoney(last.value, this.locale(), { wholeDollars: true }),
    }))
  })

  protected readonly crosshairX = computed(() => {
    const index = this.crosshair.active()
    return index === null ? null : (this.layout().xs[index] ?? null)
  })

  protected readonly tooltip = computed(() => {
    const index = this.crosshair.active()
    const x = index === null ? undefined : this.layout().xs[index]
    if (index === null || x === undefined) {
      return null
    }
    const locale = this.locale()
    const rows: TooltipRow[] = this.series().map((entry, seriesIndex) => ({
      id: entry.id,
      label: entry.label,
      value: this.money(this.values()[seriesIndex]?.[index] ?? null),
      color: this.colors()[seriesIndex] ?? 'neutral',
    }))
    const heading = monthText(this.data()[index]?.x ?? '', locale, { long: true, withYear: true })
    return { x, heading, rows }
  })

  protected readonly summaries = computed(() => {
    const locale = this.locale()
    const months = this.data().map((datum) => monthText(datum.x, locale, { long: true }))
    return this.series().flatMap((entry, index) => {
      const known = (this.values()[index] ?? []).flatMap((value, at) =>
        value === null ? [] : [{ value, at }]
      )
      const first = known[0]
      const last = known.at(-1)
      if (!first || !last) {
        return []
      }
      const max = known.reduce((best, item) => (item.value > best.value ? item : best), first)
      return [
        {
          id: entry.id,
          params: {
            label: entry.label,
            first: this.money(first.value),
            firstMonth: months[first.at] ?? '',
            last: this.money(last.value),
            lastMonth: months[last.at] ?? '',
            max: this.money(max.value),
            maxMonth: months[max.at] ?? '',
          },
        },
      ]
    })
  })

  private readonly tableLabels = translateSignal(TABLE_KEYS)

  readonly table = computed<ChartTable>(() => {
    const [month = '', total = ''] = this.tableLabels()
    const locale = this.locale()
    const values = this.values()
    return {
      columns: [
        { label: month, numeric: false },
        ...this.series().map((entry) => ({ label: entry.label, numeric: true })),
      ],
      rows: this.data().map((datum, index) => ({
        label: monthText(datum.x, locale, { withYear: true }),
        cells: values.map((list) => this.money(list[index] ?? null)),
      })),
      total: {
        label: total,
        cells: values.map((list) => this.money(list.reduce<number>((sum, v) => sum + (v ?? 0), 0))),
      },
    }
  })

  /** Full amount, or an em dash for a month without data. */
  private money(cents: number | null): string {
    return cents === null ? '—' : formatMoney(cents, this.locale())
  }
}
