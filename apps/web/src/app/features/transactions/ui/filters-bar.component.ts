import { Component, input, output } from '@angular/core'
import { ChipComponent } from '../../../shared/ui/chip/chip.component'

export type FilterId = 'month' | 'account' | 'person' | 'category'

/** One chip: its current wording and whether it narrows the list. */
export interface FilterChipView {
  id: FilterId
  label: string
  active: boolean
}

/**
 * The filter row above the list: one chip per filter, each opening its
 * select sheet. A chip that narrows the list takes the selected style
 * (accent wash and check); the month always applies, so it always does.
 * "Clear" appears once something besides the month is set.
 */
@Component({
  selector: 'app-filters-bar',
  imports: [ChipComponent],
  template: `
    <div
      class="flex items-center gap-2 overflow-x-auto px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="toolbar"
      [attr.aria-label]="label()"
    >
      @for (chip of chips(); track chip.id) {
        <button
          appChip
          class="shrink-0"
          trailing="chevron-down"
          [attr.data-testid]="'transactions.filter.' + chip.id"
          [selected]="chip.active"
          (click)="opened.emit(chip.id)"
        >
          {{ chip.label }}
        </button>
      }
      @if (clearLabel()) {
        <button
          type="button"
          class="h-11 shrink-0 rounded-md px-3 text-label text-accent active:bg-surface-2"
          data-testid="transactions.filter.clear"
          (click)="cleared.emit()"
        >
          {{ clearLabel() }}
        </button>
      }
    </div>
  `,
  host: { class: 'block' },
})
export class FiltersBarComponent {
  readonly chips = input.required<readonly FilterChipView[]>()
  /** Accessible name of the toolbar. */
  readonly label = input.required<string>()
  /** Shown (as a link-style button) only when set. */
  readonly clearLabel = input('')
  readonly opened = output<FilterId>()
  readonly cleared = output<void>()
}
