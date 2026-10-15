import { Component, computed, input, model, output } from '@angular/core'
import type { FormValueControl, ValidationError } from '@angular/forms/signals'
import { IconComponent } from '../../icons/icon.component'

export type TextFieldType = 'text' | 'email' | 'password' | 'search' | 'tel' | 'url'

let nextId = 0

/**
 * Labelled text input (DESIGN.md, Text field): label above, 48px field,
 * 2px accent border on focus, 2px critical border plus an icon and message
 * on error. Works with Signal Forms (`[formField]`) or a plain `[(value)]`.
 * Money never goes through here: amounts come from the amount keypad.
 */
@Component({
  selector: 'app-text-field',
  imports: [IconComponent],
  template: `
    <label [for]="inputId" class="text-label text-ink-2">{{ label() }}</label>
    <input
      [id]="inputId"
      [type]="type()"
      [value]="value()"
      [attr.name]="name() || null"
      [attr.placeholder]="placeholder() || null"
      [attr.autocomplete]="autocomplete() || null"
      [attr.inputmode]="inputmode() || null"
      [disabled]="disabled()"
      [attr.aria-invalid]="message() ? 'true' : null"
      [attr.aria-describedby]="describedBy()"
      class="h-12 w-full rounded-md border bg-surface-1 text-body text-ink-1 placeholder:text-ink-3 focus-visible:outline-none disabled:bg-surface-2 disabled:text-ink-3"
      [class]="stateClasses()"
      (input)="onInput($event)"
      (blur)="touch.emit()"
    />
    @if (message(); as text) {
      <p [id]="messageId" class="flex items-center gap-1.5 text-label text-status-critical">
        <app-icon name="circle-alert" [size]="16" />
        {{ text }}
      </p>
    } @else if (hint(); as text) {
      <p [id]="messageId" class="text-caption text-ink-3">{{ text }}</p>
    }
  `,
  host: { class: 'flex flex-col gap-2' },
})
export class TextFieldComponent implements FormValueControl<string> {
  readonly value = model('')
  readonly label = input.required<string>()
  readonly type = input<TextFieldType>('text')
  readonly name = input('')
  readonly placeholder = input('')
  readonly autocomplete = input('')
  readonly inputmode = input('')
  readonly hint = input('')
  /** An explicit message; when empty, the first Signal Forms error is shown once touched. */
  readonly error = input('')
  readonly disabled = input(false)
  readonly touched = input(false)
  readonly errors = input<readonly ValidationError.WithOptionalFieldTree[]>([])
  readonly touch = output<void>()

  protected readonly inputId = `app-text-field-${nextId++}`
  protected readonly messageId = `${this.inputId}-message`

  protected readonly message = computed(() => {
    if (this.error()) {
      return this.error()
    }
    return this.touched() ? (this.errors()[0]?.message ?? '') : ''
  })

  /** The border widens to 2px on focus and on error; padding shrinks by 1px to keep text still. */
  protected readonly stateClasses = computed(() =>
    this.message()
      ? 'border-2 border-status-critical px-[15px]'
      : 'border-line-strong px-4 focus:border-2 focus:border-accent focus:px-[15px]'
  )

  protected readonly describedBy = computed(() =>
    this.message() || this.hint() ? this.messageId : null
  )

  protected onInput(event: Event): void {
    this.value.set((event.target as HTMLInputElement).value)
  }
}
