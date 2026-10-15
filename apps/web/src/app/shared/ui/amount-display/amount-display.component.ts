import { Component, computed, inject, input } from '@angular/core'
import { TranslocoPipe } from '@jsverse/transloco'
import {
  formatMoney,
  formatMoneyParts,
  formatTransactionAmount,
  type TransactionKind,
} from '../../../domain/money'
import { IconComponent } from '../../icons/icon.component'
import { APP_LOCALE } from '../app-locale.token'

export type AmountVariant = 'hero' | 'row' | 'stat'
/** `total` is a plain amount (a sum, a balance): minus when negative, never a plus. */
export type AmountKind = TransactionKind | 'total'

/**
 * Amounts by role (DESIGN.md, Amount display):
 * - hero: display size, proportional figures, no sign, cents in ink-2;
 * - stat: title size, whole dollars, proportional figures;
 * - row: tabular, right-aligned; expense "−$84.20" in ink, income "+$3,200.00"
 *   in the income green, transfer "$500.00" in ink-3 after the arrow glyph.
 */
@Component({
  selector: 'app-amount-display',
  imports: [IconComponent, TranslocoPipe],
  template: `
    @switch (variant()) {
      @case ('hero') {
        <span class="text-display pnum text-ink-1"
          >{{ heroParts().whole }}<span class="text-ink-2">{{ heroParts().fraction }}</span></span
        >
      }
      @case ('stat') {
        <span class="text-title pnum tracking-[-0.02em] whitespace-nowrap text-ink-1">{{
          statText()
        }}</span>
      }
      @default {
        @if (kind() === 'transfer') {
          <app-icon name="arrow-left-right" [size]="16" />
          <span class="sr-only">{{ 'ui.amount.transfer' | transloco }}</span>
        }
        <span class="text-amount tnum whitespace-nowrap">{{ rowText() }}</span>
      }
    }
  `,
  host: {
    '[class]': 'hostClasses()',
    '[attr.data-kind]': 'kind()',
  },
})
export class AmountDisplayComponent {
  private readonly locale = inject(APP_LOCALE)

  readonly cents = input.required<number>()
  readonly kind = input<AmountKind>('total')
  readonly variant = input<AmountVariant>('row')

  protected readonly heroParts = computed(() =>
    formatMoneyParts(this.cents(), this.locale(), { sign: 'never' })
  )

  protected readonly statText = computed(() =>
    formatMoney(this.cents(), this.locale(), { wholeDollars: true })
  )

  protected readonly rowText = computed(() => {
    const kind = this.kind()
    return kind === 'total'
      ? formatMoney(this.cents(), this.locale())
      : formatTransactionAmount(this.cents(), kind, this.locale())
  })

  protected readonly hostClasses = computed(() => {
    if (this.variant() !== 'row') {
      return 'inline-block'
    }
    const colour: Record<AmountKind, string> = {
      expense: 'text-expense',
      income: 'text-income',
      transfer: 'text-transfer',
      total: 'text-ink-1',
    }
    return `inline-flex items-center justify-end gap-1 text-right ${colour[this.kind()]}`
  })
}
