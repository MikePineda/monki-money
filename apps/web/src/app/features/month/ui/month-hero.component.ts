import { Component, input } from '@angular/core'
import type { DeltaDirection } from '../../../domain/month-view'
import { IconComponent } from '../../../shared/icons/icon.component'
import { AmountDisplayComponent } from '../../../shared/ui/amount-display/amount-display.component'

/**
 * The Month view's one hero number (DESIGN.md, principle 1): eyebrow, money
 * spent in display size (expense is ink, no sign), and the change against
 * the previous month. The arrow carries the status colour (good when less
 * was spent, serious when more); the words carry the meaning.
 */
@Component({
  selector: 'app-month-hero',
  imports: [AmountDisplayComponent, IconComponent],
  template: `
    <p class="text-eyebrow text-ink-2 uppercase">{{ eyebrow() }}</p>
    <app-amount-display data-testid="month.hero" variant="hero" [cents]="cents()" />
    @if (deltaText()) {
      <p data-testid="month.delta" class="flex items-center gap-1 text-body text-ink-2">
        @if (direction() !== 'flat') {
          <app-icon
            [name]="direction() === 'down' ? 'arrow-down-right' : 'arrow-up-right'"
            [size]="16"
            [class]="direction() === 'down' ? 'text-status-good' : 'text-status-serious'"
          />
        }
        <span>{{ deltaText() }}</span>
      </p>
    }
  `,
  host: { class: 'flex flex-col gap-1' },
})
export class MonthHeroComponent {
  readonly eyebrow = input.required<string>()
  readonly cents = input.required<number>()
  readonly direction = input<DeltaDirection>('flat')
  /** "8% less than September ($3,571.20)"; empty hides the line. */
  readonly deltaText = input('')
}
