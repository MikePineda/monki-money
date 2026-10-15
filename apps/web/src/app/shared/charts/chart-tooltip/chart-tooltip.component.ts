import { Component, computed, input } from '@angular/core'
import { chartColorVar, type ChartColor } from '../../../domain/charts/colors'

export interface TooltipRow {
  id: string
  label: string
  /** The formatted value; it leads the row. */
  value: string
  color: ChartColor
}

/** Gap between the crosshair (or mark) and the tooltip edge. */
const OFFSET = 12

/**
 * The hover/focus readout (DESIGN.md, Chart frame > Tooltips; dataviz,
 * Interaction): surface-1 at level 2, radius 8, one row per series with an
 * 8px dot key, the value first and strong, the series name after it. It sits
 * beside the anchor, on the side with more room, and never takes pointer
 * events. Text comes in through interpolation only (never innerHTML).
 */
@Component({
  selector: 'app-chart-tooltip',
  template: `
    @if (heading()) {
      <p data-tooltip-heading class="text-caption text-ink-3">{{ heading() }}</p>
    }
    <ul class="flex flex-col gap-0.5">
      @for (row of rows(); track row.id) {
        <li data-tooltip-row class="flex items-center gap-2 whitespace-nowrap">
          <span
            aria-hidden="true"
            class="size-2 shrink-0 rounded-full"
            [style.background-color]="colorVar(row.color)"
          ></span>
          <span data-tooltip-value class="text-label font-semibold tnum text-ink-1">{{
            row.value
          }}</span>
          <span data-tooltip-label class="text-caption text-ink-2">{{ row.label }}</span>
        </li>
      }
    </ul>
  `,
  host: {
    'class':
      'pointer-events-none absolute z-10 flex flex-col gap-1 rounded-md border border-line ' +
      'bg-surface-1 px-3 py-2 shadow-2',
    '[style.left.px]': 'left()',
    '[style.right.px]': 'right()',
    '[style.top.px]': 'top()',
    '[attr.data-side]': 'side()',
  },
})
export class ChartTooltipComponent {
  readonly heading = input('')
  readonly rows = input.required<readonly TooltipRow[]>()
  /** X of the crosshair or mark, in the positioned container's pixels. */
  readonly anchorX = input.required<number>()
  readonly containerWidth = input.required<number>()
  readonly top = input(0)

  protected readonly colorVar = chartColorVar

  protected readonly side = computed(() =>
    this.anchorX() <= this.containerWidth() / 2 ? 'right' : 'left'
  )
  protected readonly left = computed(() =>
    this.side() === 'right' ? this.anchorX() + OFFSET : null
  )
  protected readonly right = computed(() =>
    this.side() === 'left' ? this.containerWidth() - this.anchorX() + OFFSET : null
  )
}
