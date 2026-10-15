import { Component, computed, inject, input, output } from '@angular/core'
import { formatMoney } from '../../../domain/money'
import { IconComponent } from '../../../shared/icons/icon.component'
import { AmountKeypadComponent } from '../../../shared/ui/amount-keypad/amount-keypad.component'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'

let nextId = 0

/**
 * A money field for the goal form: a label, the amount in a field-shaped
 * button (tabular figures) and, when open, the amount keypad under it.
 * Money is never typed as text (DESIGN.md, Text field). The error replaces
 * the hint, with an icon, like a text field's.
 */
@Component({
  selector: 'app-goal-amount-field',
  imports: [AmountKeypadComponent, IconComponent],
  template: `
    <span [id]="labelId" class="text-label text-ink-2">{{ label() }}</span>
    <button
      type="button"
      class="flex h-12 w-full items-center rounded-md border bg-surface-1 text-left text-amount tnum text-ink-1"
      [class]="
        error()
          ? 'border-2 border-status-critical px-[15px]'
          : open()
            ? 'border-2 border-accent px-[15px]'
            : 'border-line-strong px-4'
      "
      [attr.data-testid]="testId()"
      [attr.aria-labelledby]="labelId + ' ' + valueId"
      [attr.aria-describedby]="error() || hint() ? messageId : null"
      [attr.aria-expanded]="open()"
      (click)="toggled.emit()"
    >
      <span [id]="valueId">{{ text() }}</span>
    </button>
    @if (error(); as message) {
      <p [id]="messageId" class="flex items-center gap-1.5 text-label text-status-critical">
        <app-icon name="circle-alert" [size]="16" />{{ message }}
      </p>
    } @else if (hint(); as message) {
      <p [id]="messageId" class="text-caption text-ink-3">{{ message }}</p>
    }
    @if (open()) {
      <app-amount-keypad
        class="-mx-4 mt-1"
        [attr.data-testid]="testId() + 'Keypad'"
        [value]="cents()"
        (valueChange)="changed.emit($event)"
      />
    }
  `,
  host: { class: 'flex flex-col gap-2' },
})
export class GoalAmountFieldComponent {
  private readonly locale = inject(APP_LOCALE)

  readonly label = input.required<string>()
  readonly cents = input.required<number>()
  readonly open = input(false)
  readonly hint = input('')
  readonly error = input('')
  readonly testId = input('')
  readonly toggled = output<void>()
  readonly changed = output<number>()

  private readonly id = nextId++
  protected readonly labelId = `goal-amount-${this.id}-label`
  protected readonly valueId = `goal-amount-${this.id}-value`
  protected readonly messageId = `goal-amount-${this.id}-message`

  protected readonly text = computed(() => formatMoney(this.cents(), this.locale()))
}
