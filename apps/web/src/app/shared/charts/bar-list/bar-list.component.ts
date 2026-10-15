import { Component, computed, forwardRef, inject, input, model } from '@angular/core'
import { TranslocoPipe, translateSignal } from '@jsverse/transloco'
import { layoutBarList, type BarListDatum, type BarListRow } from '../../../domain/charts/bar-list'
import { chartColorVar } from '../../../domain/charts/colors'
import { formatPercent } from '../../../domain/charts/format'
import { formatMoney } from '../../../domain/money'
import { IconComponent } from '../../icons/icon.component'
import { APP_LOCALE } from '../../ui/app-locale.token'
import { ChartTableSource, type ChartTable } from '../chart-table'
import { provideChartsI18n } from '../charts-i18n'

/** Bars never fill their slot (dataviz: at most 24px thick). */
const MAX_BAR = 24
const MIN_BAR = 4

/**
 * Keys read from TypeScript, relative to the charts scope (markers for
 * transloco-keys-manager, which cannot see keys held in variables):
 * t(charts.table.name, charts.table.amount, charts.table.share, charts.table.total)
 */
const TABLE_KEYS = ['table.name', 'table.amount', 'table.share', 'table.total']

/**
 * Horizontal bar list (DESIGN.md, "Gasto por categoría"): one row per group
 * with the name left in label ink, the full amount right in tabular figures
 * and the bar beneath it, sorted by amount with "Other" last. Bars are 12px
 * by default (at most 24), square at the baseline with a 4px rounded data
 * end, in the neutral mark unless an entity colour is given. Groups with
 * children expand in place; `expanded` holds the open group ids.
 *
 * Every value is labelled on its row, so the list needs no tooltip; the
 * table view adds the share of the total.
 */
@Component({
  selector: 'app-bar-list',
  imports: [IconComponent, TranslocoPipe],
  providers: [
    provideChartsI18n(),
    { provide: ChartTableSource, useExisting: forwardRef(() => BarListComponent) },
  ],
  template: `
    <ul
      class="flex flex-col"
      [attr.aria-label]="'charts.barList.summary' | transloco: summaryParams()"
    >
      @for (row of rows(); track row.id) {
        <li
          data-bar-row
          class="bar-row relative flex flex-col gap-2 border-t border-line py-3 first:border-t-0"
          [class.pl-4]="row.depth === 1"
          [attr.data-depth]="row.depth"
          [attr.data-expanded]="row.expandable ? row.expanded : null"
        >
          <div class="flex items-baseline justify-between gap-3">
            @if (row.expandable) {
              <button
                type="button"
                data-bar-toggle
                class="bar-toggle flex min-w-0 items-center gap-1 text-left text-label text-ink-1"
                [attr.aria-expanded]="row.expanded"
                (click)="toggle(row.id)"
              >
                <span data-bar-label class="truncate">{{ row.label }}</span>
                <app-icon
                  name="chevron-down"
                  class="text-ink-3"
                  [size]="16"
                  [class.rotate-180]="row.expanded"
                />
              </button>
            } @else {
              <span
                data-bar-label
                class="min-w-0 truncate text-label"
                [class]="row.depth === 1 ? 'text-ink-2' : 'text-ink-1'"
                >{{ row.label }}</span
              >
            }
            <span data-bar-amount class="shrink-0 text-amount tnum text-ink-1">{{
              amount(row.valueCents)
            }}</span>
          </div>
          <span
            aria-hidden="true"
            data-bar-track
            class="block"
            [style.height.px]="row.depth === 1 ? childThickness() : thickness()"
          >
            @if (row.fraction > 0) {
              <span
                data-bar
                class="block h-full rounded-r-sm"
                [style.width]="barWidth(row)"
                [style.background-color]="colorVar(row.color)"
              ></span>
            }
          </span>
        </li>
      }
    </ul>
  `,
  styleUrl: './bar-list.component.scss',
  host: { class: 'block' },
})
export class BarListComponent implements ChartTableSource {
  private readonly locale = inject(APP_LOCALE)

  readonly data = input.required<readonly BarListDatum[]>()
  /** Ids of the expanded groups (a group's id defaults to its label). */
  readonly expanded = model<readonly string[]>([])
  /** Group bar thickness in px, capped at 24; child bars are two thirds of it. */
  readonly barHeight = input(12)
  /** Header of the label column in the table view ("Category"); defaults to "Name". */
  readonly nameHeader = input('')

  protected readonly colorVar = chartColorVar

  protected readonly layout = computed(() => layoutBarList(this.data(), this.expanded()))
  protected readonly rows = computed(() => this.layout().rows)
  protected readonly thickness = computed(() =>
    Math.min(MAX_BAR, Math.max(MIN_BAR, Math.round(this.barHeight())))
  )
  protected readonly childThickness = computed(() => Math.round((this.thickness() * 2) / 3))

  protected readonly summaryParams = computed(() => {
    const { rows, totalCents } = this.layout()
    const largest = rows[0]
    return {
      count: rows.filter((row) => row.depth === 0).length,
      total: this.amount(totalCents),
      label: largest?.label ?? '',
      amount: largest ? this.amount(largest.valueCents) : '',
    }
  })

  private readonly tableLabels = translateSignal(TABLE_KEYS)

  /** Every group with all of its children, whatever is expanded on screen. */
  readonly table = computed<ChartTable>(() => {
    const [name = '', amount = '', share = '', total = ''] = this.tableLabels()
    const allGroups = this.data().map((datum) => datum.id ?? datum.label)
    const { rows, totalCents } = layoutBarList(this.data(), allGroups)
    const locale = this.locale()
    return {
      columns: [
        { label: this.nameHeader() || name, numeric: false },
        { label: amount, numeric: true },
        { label: share, numeric: true },
      ],
      rows: rows.map((row) => ({
        label: row.label,
        cells: [this.amount(row.valueCents), formatPercent(row.percent, locale)],
        depth: row.depth,
      })),
      total: {
        label: total,
        cells: [this.amount(totalCents), formatPercent(totalCents > 0 ? 100 : 0, locale)],
      },
    }
  })

  protected amount(cents: number): string {
    return formatMoney(cents, this.locale())
  }

  /** A sliver stays visible for tiny positive values. */
  protected barWidth(row: BarListRow): string {
    return `max(2px, ${row.fraction * 100}%)`
  }

  protected toggle(id: string): void {
    this.expanded.update((ids) =>
      ids.includes(id) ? ids.filter((open) => open !== id) : [...ids, id]
    )
  }
}
