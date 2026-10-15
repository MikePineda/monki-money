import { Component, booleanAttribute, computed, input, model } from '@angular/core'
import { IconComponent } from '../../icons/icon.component'
import { PersonDotComponent, type Person } from '../person-dot/person-dot.component'

/**
 * Chip (DESIGN.md, Chip): 36px tall with a 44px hit area, radius 8.
 * - selectable (`toggle`): a filter chip; selected = accent wash, accent
 *   border and text, leading check; `aria-pressed` reflects it.
 * - value chip (`trailing="chevron-down"`): shows a current value and opens
 *   a select sheet (the consumer handles the click).
 * A person chip shows the 8px person dot before the word.
 */
@Component({
  selector: 'button[appChip]',
  imports: [IconComponent, PersonDotComponent],
  template: `
    @if (selected()) {
      <app-icon name="check" [size]="16" />
    } @else if (person(); as who) {
      <app-person-dot [person]="who" />
    }
    <span class="truncate"><ng-content /></span>
    @if (trailing(); as icon) {
      <app-icon [name]="icon" [size]="16" />
    }
  `,
  host: {
    'type': 'button',
    '[class]': 'classes()',
    '[attr.aria-pressed]': 'toggle() ? selected() : null',
    '[attr.aria-haspopup]': "trailing() ? 'dialog' : null",
    '(click)': 'onClick()',
  },
})
export class ChipComponent {
  readonly selected = model(false)
  /** A filter chip that toggles `selected` on click. */
  readonly toggle = input(false, { transform: booleanAttribute })
  readonly trailing = input<'chevron-down' | null>(null)
  readonly person = input<Person | null>(null)

  protected readonly classes = computed(() => {
    const base =
      'relative inline-flex h-9 max-w-full items-center gap-1.5 rounded-md border px-3 text-label ' +
      "whitespace-nowrap transition-colors before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']"
    return this.selected()
      ? `${base} border-accent bg-accent-soft text-accent`
      : `${base} border-line-strong bg-surface-1 text-ink-1 active:bg-surface-2`
  })

  protected onClick(): void {
    if (this.toggle()) {
      this.selected.update((value) => !value)
    }
  }
}
