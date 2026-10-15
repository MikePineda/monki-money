import { Component, computed, forwardRef, inject, input, signal } from '@angular/core'
import { translateSignal } from '@jsverse/transloco'
import { chartColorVar, seriesColor, type ChartColor } from '../../../domain/charts/colors'
import { formatPercent } from '../../../domain/charts/format'
import { dataEndPath, layoutStacked100 } from '../../../domain/charts/stacked'
import { formatMoney } from '../../../domain/money'
import { APP_LOCALE } from '../../ui/app-locale.token'
import { ChartLegendComponent, type LegendItem } from '../chart-legend/chart-legend.component'
import { ChartTableSource, type ChartTable } from '../chart-table'
import { ChartTooltipComponent } from '../chart-tooltip/chart-tooltip.component'
import { provideChartsI18n } from '../charts-i18n'
import { injectHostWidth } from '../host-width'

export interface StackedBarDatum {
  id?: string
  label: string
  valueCents: number
  /** Entity colour (people: person-a, person-b, muted for shared); defaults to series order. */
  color?: ChartColor
}

const MAX_BAR = 24
/** Tap and hover targets cover a 44px band (DESIGN.md, Charts > Interaction). */
const HIT_HEIGHT = 44

let nextStackedId = 0

/**
 * Keys read from TypeScript, relative to the charts scope (markers for
 * transloco-keys-manager, which cannot see keys held in variables):
 * t(charts.table.name, charts.table.amount, charts.table.share, charts.table.total)
 */
const TABLE_KEYS = ['table.name', 'table.amount', 'table.share', 'table.total']

/**
 * One 100%-stacked horizontal bar (DESIGN.md, "Quién pagó"): 24px thick,
 * segments in entity colours separated by 2px surface gaps, square at the
 * baseline and rounded only at the data end, with the legend always below
 * it (dot, name, percentage, amount). Segments are too thin for inline
 * labels, so the legend and the tooltip carry the values. Tapping or
 * hovering a segment shows its tooltip; its hit area is the full 44px band.
 */
@Component({
  selector: 'app-stacked-bar-100',
  imports: [ChartLegendComponent, ChartTooltipComponent],
  providers: [
    provideChartsI18n(),
    { provide: ChartTableSource, useExisting: forwardRef(() => StackedBar100Component) },
  ],
  template: `
    <div class="relative">
      <svg
        role="img"
        class="block"
        [attr.aria-labelledby]="summaryId"
        [attr.width]="width()"
        [attr.height]="hitHeight"
        [attr.viewBox]="'0 0 ' + width() + ' ' + hitHeight"
      >
        @for (segment of segments(); track segment.id) {
          @if (segment.last) {
            <path data-segment [attr.d]="segment.path" [style.fill]="segment.color" />
          } @else {
            <rect
              data-segment
              [attr.x]="segment.x"
              [attr.y]="barTop()"
              [attr.width]="segment.width"
              [attr.height]="thickness()"
              [style.fill]="segment.color"
            />
          }
        }
        @for (segment of segments(); track segment.id) {
          <rect
            data-segment-hit
            class="hit"
            y="0"
            [attr.x]="segment.x - 1"
            [attr.width]="segment.width + 2"
            [attr.height]="hitHeight"
            (pointerenter)="active.set(segment.id)"
            (pointerdown)="active.set(segment.id)"
            (pointerleave)="leave($event, segment.id)"
          />
        }
      </svg>
      <p hidden [id]="summaryId">{{ summary() }}</p>
      @if (tooltip(); as tip) {
        <app-chart-tooltip
          [rows]="tip.rows"
          [anchorX]="tip.x"
          [containerWidth]="width()"
          [top]="hitHeight"
        />
      }
    </div>
    <app-chart-legend layout="list" [items]="legend()" />
  `,
  styleUrl: './stacked-bar-100.component.scss',
  host: { class: 'flex flex-col gap-2' },
})
export class StackedBar100Component implements ChartTableSource {
  private readonly locale = inject(APP_LOCALE)

  readonly data = input.required<readonly StackedBarDatum[]>()
  /** Bar thickness in px, at most 24. */
  readonly barHeight = input(MAX_BAR)

  protected readonly width = injectHostWidth()
  protected readonly hitHeight = HIT_HEIGHT
  protected readonly summaryId = `stacked-summary-${nextStackedId++}`
  protected readonly active = signal<string | null>(null)

  protected readonly thickness = computed(() =>
    Math.min(MAX_BAR, Math.max(4, Math.round(this.barHeight())))
  )
  protected readonly barTop = computed(() => (HIT_HEIGHT - this.thickness()) / 2)

  private readonly items = computed(() =>
    this.data().map((datum, index) => ({
      id: datum.id ?? datum.label,
      label: datum.label,
      valueCents: datum.valueCents,
      color: datum.color ?? seriesColor(index),
    }))
  )

  private readonly layout = computed(() => layoutStacked100(this.items(), this.width()))

  protected readonly segments = computed(() => {
    const top = this.barTop()
    const height = this.thickness()
    return this.layout().segments.map((segment) => {
      const item = this.items().find((entry) => entry.id === segment.id)
      return {
        ...segment,
        color: chartColorVar(item?.color ?? 'neutral'),
        path: dataEndPath(segment.x, top, segment.width, height),
      }
    })
  })

  protected readonly legend = computed<LegendItem[]>(() => {
    const locale = this.locale()
    return this.layout().parts.map((part, index) => {
      const item = this.items()[index]
      return {
        id: part.id,
        label: item?.label ?? '',
        color: item?.color ?? 'neutral',
        detail: formatPercent(part.percent, locale),
        value: formatMoney(part.valueCents, locale),
      }
    })
  })

  protected readonly tooltip = computed(() => {
    const segment = this.segments().find((entry) => entry.id === this.active())
    const item = this.items().find((entry) => entry.id === this.active())
    if (!segment || !item) {
      return null
    }
    const locale = this.locale()
    return {
      x: segment.x + segment.width / 2,
      rows: [
        {
          id: item.id,
          label: `${item.label} · ${formatPercent(segment.percent, locale)}`,
          value: formatMoney(item.valueCents, locale),
          color: item.color,
        },
      ],
    }
  })

  /** "You 46% ($1,510.40), Your partner 31% ($1,018.20) and Shared 23% ($756.00)." */
  protected readonly summary = computed(() => {
    const locale = this.locale()
    const parts = this.legend().map((item) => `${item.label} ${item.detail} (${item.value})`)
    return parts.length === 0 ? '' : `${new Intl.ListFormat(locale).format(parts)}.`
  })

  private readonly tableLabels = translateSignal(TABLE_KEYS)

  readonly table = computed<ChartTable>(() => {
    const [name = '', amount = '', share = '', total = ''] = this.tableLabels()
    const locale = this.locale()
    const { parts, totalCents } = this.layout()
    return {
      columns: [
        { label: name, numeric: false },
        { label: amount, numeric: true },
        { label: share, numeric: true },
      ],
      rows: parts.map((part, index) => ({
        label: this.items()[index]?.label ?? '',
        cells: [formatMoney(part.valueCents, locale), formatPercent(part.percent, locale)],
      })),
      total: {
        label: total,
        cells: [formatMoney(totalCents, locale), formatPercent(totalCents > 0 ? 100 : 0, locale)],
      },
    }
  })

  protected leave(event: PointerEvent, id: string): void {
    if (event.pointerType !== 'touch' && this.active() === id) {
      this.active.set(null)
    }
  }
}
