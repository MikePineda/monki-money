import { Component, computed, input, model, output } from '@angular/core'
import type { FormCheckboxControl, ValidationError } from '@angular/forms/signals'
import { IconComponent } from '../../icons/icon.component'

let nextId = 0

/**
 * Checkbox (DESIGN.md, Colors: "checked checkbox"): a 20px box, radius 4,
 * line-strong border at rest, accent fill with an accent-ink check when
 * checked, inside a label row with a 44px hit area. The label is projected,
 * so it can hold links (terms, privacy). Works with Signal Forms
 * (`[formField]`) or a plain `[(checked)]`.
 */
@Component({
  selector: 'app-checkbox',
  imports: [IconComponent],
  template: `
    <label [for]="inputId" class="flex min-h-11 cursor-pointer items-start gap-3 py-2.5">
      <span class="relative mt-0.5 grid size-5 shrink-0 place-items-center">
        <input
          [id]="inputId"
          type="checkbox"
          class="absolute inset-0 m-0 size-5 cursor-pointer appearance-none rounded-sm border bg-surface-1 checked:border-accent checked:bg-accent disabled:cursor-default disabled:bg-surface-2"
          [class]="message() ? 'border-2 border-status-critical' : 'border-line-strong'"
          [checked]="checked()"
          [disabled]="disabled()"
          [attr.aria-invalid]="message() ? 'true' : null"
          [attr.aria-describedby]="message() ? messageId : null"
          (change)="onChange($event)"
          (blur)="touch.emit()"
        />
        @if (checked()) {
          <app-icon name="check" [size]="16" class="pointer-events-none relative text-accent-ink" />
        }
      </span>
      <span class="min-w-0 flex-1 text-body text-ink-1"><ng-content /></span>
    </label>
    @if (message(); as text) {
      <p [id]="messageId" class="flex items-center gap-1.5 text-label text-status-critical">
        <app-icon name="circle-alert" [size]="16" />
        {{ text }}
      </p>
    }
  `,
  host: { class: 'flex flex-col gap-1' },
})
export class CheckboxComponent implements FormCheckboxControl {
  readonly checked = model(false)
  readonly disabled = input(false)
  readonly touched = input(false)
  readonly errors = input<readonly ValidationError.WithOptionalFieldTree[]>([])
  readonly touch = output<void>()

  protected readonly inputId = `app-checkbox-${nextId++}`
  protected readonly messageId = `${this.inputId}-message`

  protected readonly message = computed(() =>
    this.touched() ? (this.errors()[0]?.message ?? '') : ''
  )

  protected onChange(event: Event): void {
    this.checked.set((event.target as HTMLInputElement).checked)
  }
}
