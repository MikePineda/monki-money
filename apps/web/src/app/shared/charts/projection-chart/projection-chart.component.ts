import { Component, computed, forwardRef, inject, input } from '@angular/core'
import { TranslocoPipe, translateSignal } from '@jsverse/transloco'
import { chartColorVar } from '../../../domain/charts/colors'
import { compactMoney, monthText } from '../../../domain/charts/format'
import { xLabelIndices } from '../../../domain/charts/line'
import { layoutProjection, type MonthValue } from '../../../domain/charts/projection'
import { formatMoney } from '../../../domain/money'
import { APP_LOCALE } from '../../ui/app-locale.token'
import { ChartLegendComponent, type LegendItem } from '../chart-legend/chart-legend.component'
import { ChartTableSource, type ChartTable } from '../chart-table'
import { ChartTooltipComponent } from '../chart-tooltip/chart-tooltip.component'
import { provideChartsI18n } from '../charts-i18n'
import { Crosshair } from '../crosshair'
import { injectHostWidth } from '../host-width'

type NoteKey = 'reaches' | 'reached' | 'beyond' | 'notReached'

let nextProjectionId = 0

/**
 * Keys read from TypeScript, relative to the charts scope (markers for
 * transloco-keys-manager, which cannot see keys held in variables):
 * t(charts.projection.actual, charts.projection.projected, charts.table.month)
 * t(charts.table.amount, charts.table.goal, charts.estimate, charts.projection.reaches)
 * t(charts.projection.reached, charts.projection.beyond, charts.projection.notReached)
 */
const ESTIMATE_KEY = 'estimate'
const KEYS = [
  'projection.actual',
  'projection.projected',
  'table.month',
  'table.amount',
  'table.goal',
]

/**
 * Goal projection (post-MVP goals screen): actual months as a solid neutral
 * line with ringed markers, the projected months as the one dashed segment
 * the charts allow, continuing from the last actual month, and the goal as
 * a solid labelled hairline with a marker on the month that reaches it. A
 * caption says when, always as an estimate. Same axis, crosshair, tooltip
 * and keyboard behaviour as the trend line.
 */
@Component({
  selector: 'app-projection-chart',
  imports: [ChartLegendComponent, ChartTooltipComponent, TranslocoPipe],
  providers: [
    provideChartsI18n(),
    { provide: ChartTableSource, useExisting: forwardRef(() => ProjectionChartComponent) },
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
        @if (layout().threshold; as threshold) {
          <line
            class="threshold"
            [attr.x1]="layout().line.plot.left"
            [attr.x2]="width()"
            [attr.y1]="threshold.y"
            [attr.y2]="threshold.y"
          />
          <text
            class="threshold-label"
            [attr.x]="layout().line.plot.left"
            [attr.y]="threshold.y - 4"
          >
            {{ 'charts.projection.goal' | transloco: { amount: goalAmount() } }}
          </text>
        }
        @if (crosshairX(); as x) {
          <line
            class="crosshair"
            [attr.x1]="x"
            [attr.x2]="x"
            [attr.y1]="layout().line.plot.top"
            [attr.y2]="layout().line.plot.bottom"
          />
        }
        <path
          data-actual
          class="series-line"
          [attr.d]="layout().historyPath"
          [style.stroke]="color"
        />
        @if (layout().projectionPath) {
          <path
            data-projected
            class="series-line"
            stroke-dasharray="4 4"
            [attr.d]="layout().projectionPath"
            [style.stroke]="color"
          />
        }
        <g data-series="actual">
          @for (point of actualPoints(); track point.index) {
            <circle
              class="marker"
              [attr.cx]="point.x"
              [attr.cy]="point.y"
              [attr.r]="point.index === crosshair.active() ? 5 : 4"
              [style.fill]="color"
            />
          }
        </g>
        @if (layout().crossing; as crossing) {
          <circle
            data-crossing
            class="marker"
            r="5"
            [attr.cx]="crossing.x"
            [attr.cy]="crossing.y"
            [style.fill]="color"
          />
        }
      </svg>
      <p hidden data-chart-summary [id]="summaryId">
        @if (summaryParams(); as params) {
          {{ 'charts.projection.summary' | transloco: params }}
        }
        @if (note(); as note) {
          {{ 'charts.projection.' + note.key | transloco: { month: note.month } }}
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
    @if (note(); as note) {
      <p data-projection-note class="text-caption text-ink-3">
        {{ 'charts.projection.' + note.key | transloco: { month: note.month } }}
      </p>
    }
  `,
  styleUrl: './projection-chart.component.scss',
  host: { class: 'flex flex-col gap-3' },
})
export class ProjectionChartComponent implements ChartTableSource {
  private readonly locale = inject(APP_LOCALE)

  readonly history = input.required<readonly MonthValue[]>()
  /** Estimated months after the last actual one. */
  readonly projection = input<readonly MonthValue[]>([])
  /** The goal; null draws no threshold. */
  readonly thresholdCents = input<number | null>(null)
  /** Last month to draw ('YYYY-MM'); later projected months are trimmed. */
  readonly horizon = input<string | null>(null)
  readonly height = input(180)

  protected readonly width = injectHostWidth()
  protected readonly summaryId = `projection-summary-${nextProjectionId++}`
  /** One entity, so one neutral mark; the dash alone says "estimate". */
  protected readonly color = chartColorVar('neutral')

  protected readonly layout = computed(() =>
    layoutProjection(
      {
        history: this.history(),
        projection: this.projection(),
        thresholdCents: this.thresholdCents(),
        horizon: this.horizon(),
      },
      { width: this.width(), height: this.height() }
    )
  )

  protected readonly crosshair = new Crosshair(() => this.layout().line.xs)
  private readonly labels = translateSignal(KEYS)
  private readonly estimateTemplate = translateSignal(ESTIMATE_KEY, { value: '{value}' })

  protected readonly ticks = computed(() =>
    this.layout().line.ticks.map((tick) => ({
      ...tick,
      text: compactMoney(tick.value, this.locale()),
    }))
  )

  protected readonly xLabels = computed(() => {
    const { line, months } = this.layout()
    return xLabelIndices(months.length, line.plot.right - line.plot.left).map((index) => ({
      index,
      x: line.xs[index] ?? 0,
      text: monthText(months[index] ?? '', this.locale()),
    }))
  })

  protected readonly actualPoints = computed(() =>
    this.layout().points.filter((point) => !point.projected)
  )

  protected readonly goalAmount = computed(() => {
    const goal = this.thresholdCents()
    return goal === null ? '' : formatMoney(goal, this.locale(), { wholeDollars: true })
  })

  protected readonly legend = computed<LegendItem[]>(() => {
    const [actual = '', projected = ''] = this.labels()
    const items: LegendItem[] = [{ id: 'actual', label: actual, color: 'neutral', key: 'line' }]
    if (this.layout().projectionPath) {
      items.push({ id: 'projected', label: projected, color: 'neutral', key: 'dashed' })
    }
    return items
  })

  protected readonly note = computed<{ key: NoteKey; month: string } | null>(() => {
    const { crossing, beyondHorizon, threshold, months } = this.layout()
    const month = (x: string) => monthText(x, this.locale(), { long: true, withYear: true })
    if (crossing) {
      return { key: crossing.projected ? 'reaches' : 'reached', month: month(crossing.month) }
    }
    if (beyondHorizon) {
      return { key: 'beyond', month: month(beyondHorizon.month) }
    }
    const last = months.at(-1)
    return threshold && last ? { key: 'notReached', month: month(last) } : null
  })

  protected readonly summaryParams = computed(() => {
    const points = this.layout().points
    const lastActual = points.filter((point) => !point.projected).at(-1)
    const end = points.at(-1)
    if (!lastActual || !end || !end.projected) {
      return null
    }
    const month = (x: string) => monthText(x, this.locale(), { long: true, withYear: true })
    return {
      last: formatMoney(lastActual.valueCents, this.locale()),
      lastMonth: month(lastActual.month),
      projected: formatMoney(end.valueCents, this.locale()),
      endMonth: month(end.month),
    }
  })

  protected readonly crosshairX = computed(() => {
    const index = this.crosshair.active()
    return index === null ? null : (this.layout().line.xs[index] ?? null)
  })

  protected readonly tooltip = computed(() => {
    const index = this.crosshair.active()
    const point = index === null ? undefined : this.layout().points[index]
    if (!point) {
      return null
    }
    const [actual = '', projected = ''] = this.labels()
    const locale = this.locale()
    return {
      x: point.x,
      heading: monthText(point.month, locale, { long: true, withYear: true }),
      rows: [
        {
          id: point.projected ? 'projected' : 'actual',
          label: point.projected ? projected : actual,
          value: formatMoney(point.valueCents, locale),
          color: 'neutral' as const,
        },
      ],
    }
  })

  readonly table = computed<ChartTable>(() => {
    const [, , month = '', amount = '', goal = ''] = this.labels()
    const locale = this.locale()
    const goalCents = this.thresholdCents()
    return {
      columns: [
        { label: month, numeric: false },
        { label: amount, numeric: true },
      ],
      rows: this.layout().points.map((point) => {
        const value = formatMoney(point.valueCents, locale)
        return {
          label: monthText(point.month, locale, { withYear: true }),
          cells: [point.projected ? this.estimate(value) : value],
        }
      }),
      total: goalCents === null ? null : { label: goal, cells: [formatMoney(goalCents, locale)] },
    }
  })

  /** "$7,750.00 (estimate)": the catalogue owns the wording around the value. */
  private estimate(value: string): string {
    return this.estimateTemplate().replace('{value}', value)
  }
}
