import { Component, ViewEncapsulation, computed, input } from '@angular/core'
import { IconComponent } from '../../icons/icon.component'
import { AmountDisplayComponent } from '../amount-display/amount-display.component'

export type StatTrend = 'up' | 'down'

/**
 * Stat tile (DESIGN.md, Stat tile): caption label, whole-dollar value in
 * title size, and an optional delta. The delta arrow is status-good when the
 * change is favourable and status-serious when it is not; the words carry
 * the meaning ("8% less than Sep"). Adjacent tiles get a hairline between them.
 * Projected content (a trend sparkline from the charts package) goes last.
 */
@Component({
  selector: 'app-stat-tile',
  imports: [AmountDisplayComponent, IconComponent],
  template: `
    <span class="text-caption text-ink-2">{{ label() }}</span>
    <app-amount-display [cents]="valueCents()" variant="stat" />
    @if (deltaText()) {
      <span class="flex items-center gap-1 text-caption text-ink-2">
        @if (trend(); as direction) {
          <app-icon
            [name]="direction === 'up' ? 'arrow-up-right' : 'arrow-down-right'"
            [size]="16"
            [class]="trendClass()"
          />
        }
        <span class="truncate">{{ deltaText() }}</span>
      </span>
    }
    <ng-content />
  `,
  styleUrl: './stat-tile.component.scss',
  encapsulation: ViewEncapsulation.None,
  host: { class: 'flex min-w-0 flex-col gap-1' },
})
export class StatTileComponent {
  readonly label = input.required<string>()
  readonly valueCents = input.required<number>()
  readonly trend = input<StatTrend | null>(null)
  /** Whether the change is good news (less spending, more income or savings). */
  readonly favourable = input(true)
  readonly deltaText = input('')

  protected readonly trendClass = computed(() =>
    this.favourable() ? 'text-status-good' : 'text-status-serious'
  )
}
