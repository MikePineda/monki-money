import { Component, DestroyRef, inject, input, model, output, signal } from '@angular/core'
import type { FormValueControl } from '@angular/forms/signals'
import { TranslocoPipe } from '@jsverse/transloco'
import { applyKeypadKey, formatMoneySpoken, type KeypadKey } from '../../../domain/money'
import { IconComponent } from '../../icons/icon.component'
import { APP_LOCALE } from '../app-locale.token'

/** Holding backspace this long clears the amount. */
export const KEYPAD_LONG_PRESS_MS = 500

const KEYS: readonly KeypadKey[] = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '00',
  '0',
  'backspace',
]

/**
 * The amount keypad (DESIGN.md, Amount keypad): 3 x 4 keys of 56px separated
 * by hairlines, entry shifting in from the cents, value in integer cents.
 * A Signal Forms control (`[formField]`), so amounts never come from free
 * text. Holding ⌫ clears; physical digits and Backspace work when focused.
 * Every change is announced to screen readers ("42.50 Australian dollars").
 */
@Component({
  selector: 'app-amount-keypad',
  imports: [IconComponent, TranslocoPipe],
  template: `
    <div
      role="group"
      [attr.aria-label]="'ui.keypad.label' | transloco"
      class="grid grid-cols-3 gap-px border-y border-line bg-line"
      (keydown)="onKeydown($event)"
    >
      @for (key of keys; track key) {
        @if (key === 'backspace') {
          <button
            type="button"
            data-key="backspace"
            class="grid h-14 place-items-center bg-surface-0 text-ink-1 active:bg-surface-2 disabled:text-ink-3"
            [attr.aria-label]="'ui.keypad.delete' | transloco"
            [attr.title]="'ui.keypad.clearHint' | transloco"
            [disabled]="disabled()"
            (click)="onBackspaceClick()"
            (pointerdown)="startLongPress()"
            (pointerup)="cancelLongPress()"
            (pointerleave)="cancelLongPress()"
            (pointercancel)="cancelLongPress()"
          >
            <app-icon name="delete" />
          </button>
        } @else {
          <button
            type="button"
            [attr.data-key]="key"
            class="h-14 bg-surface-0 text-title font-medium tnum text-ink-1 active:bg-surface-2 disabled:text-ink-3"
            [disabled]="disabled()"
            (click)="press(key)"
          >
            {{ key }}
          </button>
        }
      }
    </div>
    <p class="sr-only" aria-live="polite" aria-atomic="true">{{ announcement() }}</p>
  `,
  host: { class: 'block' },
})
export class AmountKeypadComponent implements FormValueControl<number> {
  private readonly locale = inject(APP_LOCALE)

  /** Integer cents. */
  readonly value = model(0)
  readonly disabled = input(false)
  readonly touch = output<void>()

  protected readonly keys = KEYS
  protected readonly announcement = signal('')

  private longPressTimer: ReturnType<typeof setTimeout> | undefined
  private longPressFired = false

  constructor() {
    inject(DestroyRef).onDestroy(() => this.cancelLongPress())
  }

  press(key: KeypadKey): void {
    if (this.disabled()) {
      return
    }
    const next = applyKeypadKey(this.value(), key)
    this.value.set(next)
    this.announcement.set(formatMoneySpoken(next, this.locale()))
    this.touch.emit()
  }

  protected onBackspaceClick(): void {
    // The click that ends a long press must not also delete a digit.
    if (this.longPressFired) {
      this.longPressFired = false
      return
    }
    this.press('backspace')
  }

  protected startLongPress(): void {
    this.cancelLongPress()
    this.longPressFired = false
    this.longPressTimer = setTimeout(() => {
      this.longPressFired = true
      this.press('clear')
    }, KEYPAD_LONG_PRESS_MS)
  }

  protected cancelLongPress(): void {
    if (this.longPressTimer !== undefined) {
      clearTimeout(this.longPressTimer)
      this.longPressTimer = undefined
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (/^[0-9]$/.test(event.key)) {
      this.press(event.key as KeypadKey)
    } else if (event.key === 'Backspace') {
      this.press('backspace')
    } else if (event.key === 'Delete' || event.key === 'Escape') {
      this.press('clear')
    } else {
      return
    }
    event.preventDefault()
  }
}
