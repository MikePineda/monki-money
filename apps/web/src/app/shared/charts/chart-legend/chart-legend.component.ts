import { Component, input } from '@angular/core'
import { chartColorVar, type ChartColor } from '../../../domain/charts/colors'

/** The key mirrors the mark: a dot for bars and segments, a line for lines. */
export type LegendKey = 'dot' | 'line' | 'dashed'

export interface LegendItem {
  id: string
  label: string
  color: ChartColor
  key?: LegendKey
  /** A formatted amount, shown at the end in list layout. */
  value?: string
  /** A secondary figure such as a percentage, shown before the value. */
  detail?: string
}

/**
 * Chart legend (DESIGN.md, Charts > Text and structure): an 8px dot or a
 * 12px line key in the series colour, and the label in ink, never in the
 * series colour. `row` sits above the plot; `list` stacks items with their
 * figures (the "who paid" bar).
 */
@Component({
  selector: 'app-chart-legend',
  template: `
    <ul [class]="layout() === 'row' ? 'flex flex-wrap gap-x-4 gap-y-1' : 'flex flex-col'">
      @for (item of items(); track item.id) {
        <li
          data-legend-item
          class="flex min-w-0 items-center gap-2"
          [class]="layout() === 'row' ? 'text-label text-ink-1' : 'min-h-8 text-body text-ink-1'"
        >
          @switch (item.key ?? 'dot') {
            @case ('dot') {
              <span
                aria-hidden="true"
                data-legend-key="dot"
                class="size-2 shrink-0 rounded-full"
                [style.background-color]="colorVar(item.color)"
              ></span>
            }
            @default {
              <svg
                aria-hidden="true"
                [attr.data-legend-key]="item.key"
                width="12"
                height="8"
                class="shrink-0"
              >
                <line
                  x1="0"
                  x2="12"
                  y1="4"
                  y2="4"
                  stroke-width="2"
                  [attr.stroke-dasharray]="item.key === 'dashed' ? '4 4' : null"
                  [style.stroke]="colorVar(item.color)"
                />
              </svg>
            }
          }
          <span data-legend-label class="min-w-0 truncate">{{ item.label }}</span>
          @if (layout() === 'list') {
            <span class="ml-auto flex shrink-0 items-baseline gap-2">
              @if (item.detail) {
                <span data-legend-detail class="text-label tnum text-ink-2">{{ item.detail }}</span>
              }
              @if (item.value) {
                <span data-legend-value class="text-amount tnum text-ink-1">{{ item.value }}</span>
              }
            </span>
          }
        </li>
      }
    </ul>
  `,
  host: { class: 'block' },
})
export class ChartLegendComponent {
  readonly items = input.required<readonly LegendItem[]>()
  readonly layout = input<'row' | 'list'>('row')

  protected readonly colorVar = chartColorVar
}
