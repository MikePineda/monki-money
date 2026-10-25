import { Component, ViewEncapsulation, computed, input, output } from '@angular/core'
import { IconComponent } from '../../../shared/icons/icon.component'
import { AmountDisplayComponent } from '../../../shared/ui/amount-display/amount-display.component'
import { LongPressDirective } from '../../../shared/ui/long-press/long-press.directive'
import { PersonDotComponent } from '../../../shared/ui/person-dot/person-dot.component'
import type { TransactionRowView } from './transaction-row.view'

/**
 * Whether the row takes part in a multi-select: `none` outside it, else
 * picked or not, or `unavailable` (a partner's private row).
 */
export type RowSelection = 'none' | 'unselected' | 'selected' | 'unavailable'

/**
 * One 56px transaction row (DESIGN.md, List row): the category square,
 * payee over "category · account" with the payer's dot, and the amount
 * right-aligned in tabular figures (expense in ink, income "+" in the income
 * green, transfer in ink-3 after the arrow). A partner's private row shows
 * a lock and "Private". Tap opens it; long-press asks for the actions.
 * While the list selects rows, the square becomes a checkbox
 * (`aria-pressed`) and a row that cannot be picked is dimmed.
 */
@Component({
  selector: 'app-transaction-row',
  imports: [AmountDisplayComponent, IconComponent, LongPressDirective, PersonDotComponent],
  template: `
    <button
      type="button"
      class="flex h-14 w-full items-center gap-3 px-4 text-left active:bg-surface-2"
      data-testid="transactions.row"
      [attr.data-id]="view().id"
      [attr.data-kind]="view().kind"
      [attr.data-masked]="view().masked || null"
      [attr.data-selection]="selection() === 'none' ? null : selection()"
      [attr.aria-pressed]="selectable() ? selection() === 'selected' : null"
      [attr.aria-disabled]="selection() === 'unavailable' || null"
      [class.opacity-50]="selection() === 'unavailable'"
      (appLongPress)="held.emit()"
      (click)="opened.emit()"
    >
      @if (selectable()) {
        <span
          class="grid size-9 shrink-0 place-items-center rounded-md border-2"
          [class]="
            selection() === 'selected'
              ? 'border-accent bg-accent text-accent-ink'
              : 'border-line-strong bg-surface-1 text-transparent'
          "
        >
          <app-icon name="check" [size]="20" />
        </span>
      } @else {
        <span class="grid size-9 shrink-0 place-items-center rounded-md bg-surface-2 text-ink-1">
          <app-icon [name]="view().icon" />
        </span>
      }
      <span class="flex min-w-0 flex-1 flex-col">
        <span
          class="row-title truncate text-body"
          [class]="view().masked ? 'text-ink-2' : 'text-ink-1'"
          >{{ view().title }}</span
        >
        <span class="flex min-w-0 items-center gap-1.5 text-caption text-ink-3">
          @if (view().person; as who) {
            <app-person-dot [person]="who" />
          }
          <span class="row-meta truncate">{{ view().meta }}</span>
          @if (view().personLabel) {
            <span class="sr-only">· {{ view().personLabel }}</span>
          }
        </span>
      </span>
      <app-amount-display class="shrink-0" [cents]="view().amountCents" [kind]="view().kind" />
    </button>
  `,
  styles: `
    /* Hairline between rows, inset to the text column (16 + 36 + 12 px). */
    app-transaction-row + app-transaction-row::before {
      content: '';
      position: absolute;
      top: 0;
      right: 0;
      left: 64px;
      height: 1px;
      background: var(--line);
    }
  `,
  encapsulation: ViewEncapsulation.None,
  host: { role: 'listitem', class: 'relative block' },
})
export class TransactionRowComponent {
  readonly view = input.required<TransactionRowView>()
  readonly selection = input<RowSelection>('none')
  readonly opened = output<void>()
  readonly held = output<void>()

  protected readonly selectable = computed(
    () => this.selection() === 'selected' || this.selection() === 'unselected'
  )
}
