import { Component, input, output } from '@angular/core'
import { IconButtonComponent } from '../ui/icon-button/icon-button.component'

/**
 * The bulk bar of a review list (DESIGN.md, Review row): fixed to the
 * bottom edge over the safe area, surface-1 at level 2. A close button
 * clears the selection, the count ("2 selected") is announced politely,
 * and the consumer projects its actions: `[bulkAside]` next to the count
 * (a quiet one, "Ignore"), the rest in a row below (secondary first, the
 * single primary last).
 */
@Component({
  selector: 'app-bulk-bar',
  imports: [IconButtonComponent],
  template: `
    <div class="mx-auto flex max-w-app flex-col gap-2 px-4 pt-2 pb-3">
      <div class="flex h-11 items-center gap-1">
        <button
          appIconButton
          type="button"
          icon="x"
          class="-ml-3"
          data-testid="review.bulk.clear"
          [label]="clearLabel()"
          (click)="cleared.emit()"
        ></button>
        <p class="min-w-0 flex-1 truncate text-body-strong text-ink-1" aria-live="polite">
          {{ countLabel() }}
        </p>
        <ng-content select="[bulkAside]" />
      </div>
      <div class="flex items-center gap-2 [&>*]:min-w-0 [&>*]:flex-1">
        <ng-content />
      </div>
    </div>
  `,
  host: {
    'role': 'toolbar',
    'class':
      'fixed inset-x-0 bottom-0 z-10 block border-t border-line bg-surface-1 pb-safe shadow-2',
    '[attr.aria-label]': 'label()',
  },
})
export class BulkBarComponent {
  /** "2 selected": the consumer words it (plural rules live in its catalogue). */
  readonly countLabel = input.required<string>()
  /** Accessible name of the close button ("Clear selection"). */
  readonly clearLabel = input.required<string>()
  /** Accessible name of the toolbar ("Selected rows"). */
  readonly label = input.required<string>()
  readonly cleared = output<void>()
}
