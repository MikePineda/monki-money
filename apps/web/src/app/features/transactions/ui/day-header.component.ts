import { Component, computed, inject, input } from '@angular/core'
import { formatMoney } from '../../../domain/money'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'

/**
 * Day-group header (DESIGN.md, List row): 32px, the day in `label` / ink-2
 * on the left ("Today · Wed 15 Oct"), the day's subtotal in tabular ink-3
 * on the right, sticky under the screen's top bar.
 */
@Component({
  selector: 'app-day-header',
  template: `
    <h2 class="truncate text-label text-ink-2">{{ label() }}</h2>
    @if (showSubtotal()) {
      <span class="shrink-0 text-amount tnum text-ink-3">{{ subtotal() }}</span>
    }
  `,
  host: {
    class:
      'sticky z-[5] flex h-8 items-center justify-between gap-4 bg-surface-0 px-4 top-[var(--day-header-top,0px)]',
  },
})
export class DayHeaderComponent {
  private readonly locale = inject(APP_LOCALE)

  readonly label = input.required<string>()
  readonly subtotalCents = input(0)
  /** Days with only transfers have nothing to add up. */
  readonly showSubtotal = input(true)

  protected readonly subtotal = computed(() =>
    formatMoney(this.subtotalCents(), this.locale(), { sign: 'always' })
  )
}
