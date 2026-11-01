import { Component, booleanAttribute, computed, input, model, output, signal } from '@angular/core'
import type { FormValueControl, ValidationError } from '@angular/forms/signals'
import { TranslocoPipe } from '@jsverse/transloco'
import { IconComponent } from '../../icons/icon.component'
import { IconButtonComponent } from '../icon-button/icon-button.component'

export type TextFieldType = 'text' | 'email' | 'password' | 'search' | 'tel' | 'url'

let nextId = 0

/**
 * Labelled text input (DESIGN.md, Text field): label above, 48px field,
 * 2px accent border on focus, 2px critical border plus an icon and message
 * on error. Works with Signal Forms (`[formField]`) or a plain `[(value)]`.
 * Money never goes through here: amounts come from the amount keypad.
 * A `revealable` password gets an eye toggle inside the field: a "Show
 * password" button, pressed while what was typed shows as plain text.
 */
@Component({
  selector: 'app-text-field',
  imports: [IconButtonComponent, IconComponent, TranslocoPipe],
  template: `
    <label [for]="inputId" class="text-label text-ink-2">{{ label() }}</label>
    <div class="relative">
      <input
        [id]="inputId"
        [type]="inputType()"
        [value]="value()"
        [attr.name]="name() || null"
        [attr.placeholder]="placeholder() || null"
        [attr.autocomplete]="autocomplete() || null"
        [attr.inputmode]="inputmode() || null"
        [attr.autocapitalize]="canReveal() ? 'off' : null"
        [attr.spellcheck]="canReveal() ? 'false' : null"
        [disabled]="disabled()"
        [attr.aria-invalid]="message() ? 'true' : null"
        [attr.aria-describedby]="describedBy()"
        class="h-12 w-full rounded-md border bg-surface-1 text-body text-ink-1 placeholder:text-ink-3 focus-visible:outline-none disabled:bg-surface-2 disabled:text-ink-3"
        [class]="stateClasses()"
        (input)="onInput($event)"
        (blur)="touch.emit()"
      />
      @if (canReveal()) {
        <button
          appIconButton
          type="button"
          class="absolute top-0.5 right-0.5 text-ink-2"
          data-testid="textField.reveal"
          [attr.aria-controls]="inputId"
          [icon]="revealed() ? 'eye-off' : 'eye'"
          [label]="'ui.password.show' | transloco"
          [pressed]="revealed()"
          [disabled]="disabled()"
          (click)="revealed.set(!revealed())"
        ></button>
      }
    </div>
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
  /** A password field gets the show/hide toggle (ignored for every other type). */
  readonly revealable = input(false, { transform: booleanAttribute })
  readonly touch = output<void>()

  protected readonly inputId = `app-text-field-${nextId++}`
  protected readonly messageId = `${this.inputId}-message`

  /** The password shows as plain text (only while `revealable`). */
  protected readonly revealed = signal(false)
  protected readonly canReveal = computed(() => this.revealable() && this.type() === 'password')
  protected readonly inputType = computed(() =>
    this.canReveal() && this.revealed() ? 'text' : this.type()
  )

  protected readonly message = computed(() => {
    if (this.error()) {
      return this.error()
    }
    return this.touched() ? (this.errors()[0]?.message ?? '') : ''
  })

  /** The border widens to 2px on focus and on error; padding shrinks by 1px to keep text still. */
  protected readonly stateClasses = computed(() => {
    const state = this.message()
      ? 'border-2 border-status-critical px-[15px]'
      : 'border-line-strong px-4 focus:border-2 focus:border-accent focus:px-[15px]'
    // Room on the right for the eye toggle: the text never runs under it.
    return this.canReveal() ? `${state} pr-12 focus:pr-12` : state
  })

  protected readonly describedBy = computed(() =>
    this.message() || this.hint() ? this.messageId : null
  )

  protected onInput(event: Event): void {
    this.value.set((event.target as HTMLInputElement).value)
  }
}
