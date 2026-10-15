import { Component, booleanAttribute, computed, input, output } from '@angular/core'
import { NgTemplateOutlet } from '@angular/common'
import type { TransactionKind } from '../../../domain/money'
import { IconComponent } from '../../icons/icon.component'
import type { IconName } from '../../icons/icon-names'
import { AmountDisplayComponent } from '../amount-display/amount-display.component'
import { PersonDotComponent, type Person } from '../person-dot/person-dot.component'

/**
 * Transaction row (DESIGN.md, List row): 56px; a 36px category square, the
 * merchant over "category · account" with the person dot, and the amount
 * right-aligned in tabular figures. Rows inside a `role="list"` container
 * get a hairline divider inset to the text column.
 */
@Component({
  selector: 'app-list-row',
  imports: [AmountDisplayComponent, IconComponent, NgTemplateOutlet, PersonDotComponent],
  template: `
    <ng-template #content>
      <span class="grid size-9 shrink-0 place-items-center rounded-md bg-surface-2 text-ink-1">
        <app-icon [name]="icon()" />
      </span>
      <span class="flex min-w-0 flex-1 flex-col">
        <span class="truncate text-body text-ink-1">{{ title() }}</span>
        @if (metaText() || person()) {
          <span class="flex min-w-0 items-center gap-1.5 text-caption text-ink-3">
            @if (person(); as who) {
              <app-person-dot [person]="who" />
            }
            <span class="truncate">{{ metaText() }}</span>
          </span>
        }
      </span>
      @if (amountCents() !== null) {
        <app-amount-display class="shrink-0" [cents]="amountCents() ?? 0" [kind]="kind()" />
      }
    </ng-template>

    @if (interactive()) {
      <button
        type="button"
        class="flex h-14 w-full items-center gap-3 px-4 text-left active:bg-surface-2"
        (click)="pressed.emit()"
      >
        <ng-container [ngTemplateOutlet]="content" />
      </button>
    } @else {
      <div class="flex h-14 items-center gap-3 px-4">
        <ng-container [ngTemplateOutlet]="content" />
      </div>
    }
  `,
  styleUrl: './list-row.component.scss',
  host: { role: 'listitem', class: 'relative block' },
})
export class ListRowComponent {
  readonly icon = input.required<IconName>()
  readonly title = input.required<string>()
  /** Secondary facts, joined with " · " (category, account, date). */
  readonly meta = input<readonly string[]>([])
  readonly person = input<Person | null>(null)
  readonly amountCents = input<number | null>(null)
  readonly kind = input<TransactionKind>('expense')
  readonly interactive = input(false, { transform: booleanAttribute })
  readonly pressed = output<void>()

  protected readonly metaText = computed(() => this.meta().filter(Boolean).join(' · '))
}
