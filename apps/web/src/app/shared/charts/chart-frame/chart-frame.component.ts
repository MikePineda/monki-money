import { Component, computed, contentChild, input, model, output } from '@angular/core'
import { TranslocoPipe } from '@jsverse/transloco'
import { IconComponent } from '../../icons/icon.component'
import { ButtonComponent } from '../../ui/button/button.component'
import { IconButtonComponent } from '../../ui/icon-button/icon-button.component'
import { SkeletonComponent } from '../../ui/skeleton/skeleton.component'
import { ChartTableSource, EMPTY_CHART_TABLE } from '../chart-table'
import { provideChartsI18n } from '../charts-i18n'

/**
 * - `ready`: the chart;
 * - `loading`: first load only, a skeleton at the plot's size;
 * - `reloading`: a refetch keeps the previous frame at 60% opacity (no
 *   skeleton flash, no layout jump);
 * - `empty` / `error`: an honest line in place of the plot.
 */
export type ChartState = 'ready' | 'loading' | 'reloading' | 'empty' | 'error'
export type ChartView = 'chart' | 'table'

let nextFrameId = 0

/**
 * Wraps every chart (DESIGN.md, Chart frame): title in heading, optional
 * caption subtitle, a 44px toggle between the chart and its table view,
 * the projected chart (legend and plot) and an optional footnote. The table
 * is read from the wrapped chart (ChartTableSource), so both views always
 * show the same numbers.
 */
@Component({
  selector: 'app-chart-frame',
  imports: [ButtonComponent, IconButtonComponent, IconComponent, SkeletonComponent, TranslocoPipe],
  providers: [provideChartsI18n()],
  template: `
    <header class="flex items-start justify-between gap-2">
      <div class="flex min-w-0 flex-col gap-0.5 py-2.5">
        <h2 class="text-heading text-ink-1" [id]="titleId">{{ title() }}</h2>
        @if (subtitle()) {
          <p data-chart-subtitle class="text-caption text-ink-3">{{ subtitle() }}</p>
        }
      </div>
      @if (hasChart()) {
        <button
          appIconButton
          data-chart-toggle
          type="button"
          [icon]="view() === 'table' ? 'chart-bar' : 'table-2'"
          [label]="'charts.frame.table' | transloco"
          [pressed]="view() === 'table'"
          (click)="toggleView()"
        ></button>
      }
    </header>

    @switch (state()) {
      @case ('loading') {
        <div role="status" class="pt-2">
          <span class="sr-only">{{ 'charts.frame.loading' | transloco }}</span>
          <app-skeleton [height]="skeletonHeight()" />
        </div>
      }
      @case ('empty') {
        <p data-chart-message class="flex items-center gap-2 py-6 text-body text-ink-2">
          <app-icon name="chart-bar" class="text-ink-3" />
          {{ emptyText() || ('charts.frame.empty' | transloco) }}
        </p>
      }
      @case ('error') {
        <div class="flex items-center gap-3 py-4">
          <app-icon name="circle-alert" class="text-status-critical" />
          <p data-chart-message class="min-w-0 flex-1 text-body text-ink-1">
            {{ 'charts.frame.error' | transloco }}
          </p>
          <button appButton data-chart-retry type="button" variant="ghost" (click)="retry.emit()">
            {{ 'charts.frame.retry' | transloco }}
          </button>
        </div>
      }
      @default {
        <div
          data-chart-body
          [class.opacity-60]="state() === 'reloading'"
          [attr.aria-busy]="state() === 'reloading'"
        >
          <div data-chart-plot class="flex flex-col gap-3" [hidden]="view() === 'table'">
            <ng-content />
          </div>
          @if (view() === 'table') {
            <table class="w-full border-collapse">
              <caption class="sr-only">
                {{
                  title()
                }}
              </caption>
              <thead>
                <tr>
                  @for (column of table().columns; track $index) {
                    <th
                      scope="col"
                      class="h-11 text-label text-ink-2"
                      [class]="column.numeric ? 'pl-3 text-right' : 'text-left'"
                    >
                      {{ column.label }}
                    </th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (row of table().rows; track $index) {
                  <tr class="h-11 border-t border-line">
                    <th
                      scope="row"
                      class="text-left text-body font-normal"
                      [class]="row.depth === 1 ? 'pl-4 text-ink-2' : 'text-ink-1'"
                    >
                      {{ row.label }}
                    </th>
                    @for (cell of row.cells; track $index) {
                      <td class="pl-3 text-right text-amount tnum whitespace-nowrap text-ink-1">
                        {{ cell }}
                      </td>
                    }
                  </tr>
                }
              </tbody>
              @if (table().total; as total) {
                <tfoot>
                  <tr class="h-11 border-t border-line-strong">
                    <th scope="row" class="text-left text-body-strong text-ink-1">
                      {{ total.label }}
                    </th>
                    @for (cell of total.cells; track $index) {
                      <td class="pl-3 text-right text-amount tnum whitespace-nowrap text-ink-1">
                        {{ cell }}
                      </td>
                    }
                  </tr>
                </tfoot>
              }
            </table>
          }
        </div>
      }
    }

    @if (footnote()) {
      <p data-chart-footnote class="pt-2 text-caption text-ink-3">{{ footnote() }}</p>
    }
  `,
  host: {
    'class': 'flex flex-col',
    'role': 'figure',
    '[attr.aria-labelledby]': 'titleId',
    '[attr.data-state]': 'state()',
  },
})
export class ChartFrameComponent {
  readonly title = input.required<string>()
  readonly subtitle = input('')
  readonly footnote = input('')
  readonly state = input<ChartState>('ready')
  /** What is missing, in the screen's words ("No spending in October yet."). */
  readonly emptyText = input('')
  /** Skeleton height on first load: the plot's height, so nothing jumps. */
  readonly skeletonHeight = input('160px')
  readonly view = model<ChartView>('chart')
  readonly retry = output<void>()

  protected readonly titleId = `chart-frame-${nextFrameId++}`

  private readonly source = contentChild(ChartTableSource)
  protected readonly table = computed(() => this.source()?.table() ?? EMPTY_CHART_TABLE)
  protected readonly hasChart = computed(
    () => this.state() === 'ready' || this.state() === 'reloading'
  )

  protected toggleView(): void {
    this.view.update((view) => (view === 'chart' ? 'table' : 'chart'))
  }
}
