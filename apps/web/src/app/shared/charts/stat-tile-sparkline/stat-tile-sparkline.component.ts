import { Component, computed, inject, input } from '@angular/core'
import { TranslocoPipe } from '@jsverse/transloco'
import { chartColorVar } from '../../../domain/charts/colors'
import { MARKER_RADIUS } from '../../../domain/charts/line'
import { layoutSparkline } from '../../../domain/charts/sparkline'
import { formatMoney } from '../../../domain/money'
import { APP_LOCALE } from '../../ui/app-locale.token'
import { provideChartsI18n } from '../charts-i18n'
import { injectHostWidth } from '../host-width'

let nextSparklineId = 0

/**
 * A stat tile's trend (dataviz, Figures: the stat tile contract): a tiny
 * 2px monotone line in the de-emphasis mark, scaled to its own range, with
 * the current period as an 8px ringed dot in the neutral mark (the accent is
 * never a mark here). The tile carries the value; the sparkline only shows
 * the shape, and names it for assistive technology. No axis, no tooltip.
 * Place it inside `<app-stat-tile>`.
 */
@Component({
  selector: 'app-stat-tile-sparkline',
  imports: [TranslocoPipe],
  providers: [provideChartsI18n()],
  template: `
    @if (layout().last; as last) {
      <svg
        role="img"
        class="block"
        [attr.aria-labelledby]="summaryId"
        [attr.width]="width()"
        [attr.height]="height()"
        [attr.viewBox]="'0 0 ' + width() + ' ' + height()"
      >
        <path class="series-line" [attr.d]="layout().path" [style.stroke]="lineColor" />
        <circle
          data-current
          class="marker"
          [attr.r]="markerRadius"
          [attr.cx]="last.x"
          [attr.cy]="last.y"
          [style.fill]="dotColor"
        />
      </svg>
      <p hidden [id]="summaryId">
        {{ 'charts.sparkline.summary' | transloco: summaryParams() }}
      </p>
    }
  `,
  styleUrl: './stat-tile-sparkline.component.scss',
  host: { class: 'block' },
})
export class StatTileSparklineComponent {
  private readonly locale = inject(APP_LOCALE)

  /** One value per period, oldest first; null for a period without data. */
  readonly values = input.required<readonly (number | null)[]>()
  readonly height = input(24)

  protected readonly width = injectHostWidth(96)
  protected readonly summaryId = `sparkline-summary-${nextSparklineId++}`
  protected readonly markerRadius = MARKER_RADIUS
  protected readonly lineColor = chartColorVar('muted')
  protected readonly dotColor = chartColorVar('neutral')

  protected readonly layout = computed(() =>
    layoutSparkline(this.values(), { width: this.width(), height: this.height() })
  )

  protected readonly summaryParams = computed(() => {
    const { points, last } = this.layout()
    const first = points[0]
    return {
      count: this.values().length,
      first: first ? formatMoney(first.value, this.locale(), { wholeDollars: true }) : '',
      last: last ? formatMoney(last.value, this.locale(), { wholeDollars: true }) : '',
    }
  })
}
