import { Component, input, output } from '@angular/core'
import { TranslocoPipe } from '@jsverse/transloco'
import { IconComponent } from '../../../shared/icons/icon.component'
import { AmountDisplayComponent } from '../../../shared/ui/amount-display/amount-display.component'
import { PersonDotComponent } from '../../../shared/ui/person-dot/person-dot.component'
import type { ImportRowView } from './import-row.view'

/**
 * One bank row in the review list (DESIGN.md, Review row), drawn next to the
 * list's checkbox: the merchant over "date · category · source" with the
 * payer's dot, the amount and the status (icon shape plus a word). A
 * doubtful row adds its suggestion as a value chip with "Change" and
 * "Accept". Tapping the row opens its triage sheet. Bank text is rendered
 * as text only.
 */
@Component({
  selector: 'app-import-row-item',
  imports: [AmountDisplayComponent, IconComponent, PersonDotComponent, TranslocoPipe],
  template: `
    <button
      type="button"
      class="flex min-h-14 w-full items-center gap-3 py-2 pr-4 text-left active:bg-surface-2"
      data-testid="import.row"
      [attr.data-id]="view().id"
      [attr.data-tone]="view().tone"
      [attr.aria-busy]="pending() || null"
      (click)="opened.emit()"
    >
      <span class="flex min-w-0 flex-1 flex-col">
        <span
          class="truncate text-body"
          data-testid="import.row.title"
          [class]="view().muted || view().masked ? 'text-ink-3' : 'text-ink-1'"
          >{{ view().title }}</span
        >
        <span class="flex min-w-0 items-center gap-1.5 text-caption text-ink-3">
          @if (view().person; as who) {
            <app-person-dot [person]="who" />
          }
          <span class="truncate" data-testid="import.row.meta">{{ view().meta }}</span>
          @if (view().personLabel) {
            <span class="sr-only">· {{ view().personLabel }}</span>
          }
        </span>
      </span>
      <span class="flex shrink-0 flex-col items-end">
        @if (view().muted) {
          <span class="text-amount tnum whitespace-nowrap text-ink-3">{{ view().amountText }}</span>
        } @else {
          <app-amount-display [cents]="view().amountCents" [kind]="view().kind" />
        }
        <span class="flex items-center gap-1 text-label text-ink-1" data-testid="import.row.status">
          <app-icon [name]="view().status.icon" [size]="16" [class]="view().status.iconClass" />
          {{ view().status.label }}
        </span>
      </span>
    </button>
    @if (view().suggestion; as suggestion) {
      <div class="mr-4 flex items-center gap-1 border-t border-line py-2">
        <span
          class="inline-flex h-9 min-w-0 items-center truncate rounded-md bg-surface-2 px-3 text-label text-ink-2"
          data-testid="import.row.suggestion"
          >{{ suggestion }}</span
        >
        <span class="flex-1"></span>
        <button
          type="button"
          class="h-11 shrink-0 rounded-md px-3 text-label text-ink-1 active:bg-surface-2"
          data-testid="import.row.change"
          [disabled]="pending()"
          (click)="changed.emit()"
        >
          {{ 'import.row.change' | transloco }}
        </button>
        <button
          type="button"
          class="-mr-3 h-11 shrink-0 rounded-md px-3 text-label font-semibold text-accent active:bg-surface-2"
          data-testid="import.row.accept"
          [disabled]="pending()"
          (click)="accepted.emit()"
        >
          {{ 'import.row.accept' | transloco }}
        </button>
      </div>
    }
  `,
  host: { class: 'block' },
})
export class ImportRowItemComponent {
  readonly view = input.required<ImportRowView>()
  /** A decision on this row is on its way. */
  readonly pending = input(false)
  readonly opened = output<void>()
  readonly accepted = output<void>()
  readonly changed = output<void>()
}
