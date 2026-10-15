import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { Component, inject, signal } from '@angular/core'
import { FormField, email, form, required } from '@angular/forms/signals'
import { TranslocoPipe } from '@jsverse/transloco'
import { formMessages } from '../../../core/i18n/form-messages'
import { BottomSheetComponent } from '../../../shared/ui/bottom-sheet/bottom-sheet.component'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import {
  TextFieldComponent,
  type TextFieldType,
} from '../../../shared/ui/text-field/text-field.component'

export interface TextInputSheetData {
  title: string
  label: string
  submitLabel: string
  value?: string
  type?: TextFieldType
  hint?: string
  /** Prefix of the field and button test ids (`<testId>.input`, `<testId>.submit`). */
  testId: string
}

/** One text field in a bottom sheet (a name, an email); closes with the trimmed value. */
@Component({
  selector: 'app-text-input-sheet',
  imports: [BottomSheetComponent, ButtonComponent, FormField, TextFieldComponent, TranslocoPipe],
  template: `
    <app-bottom-sheet [title]="data.title" [closeLabel]="'ui.sheet.close' | transloco">
      <form [id]="formId" class="px-4 pb-2" novalidate (submit)="submit($event)">
        <app-text-field
          [attr.data-testid]="data.testId + '.input'"
          autocomplete="off"
          [type]="data.type ?? 'text'"
          [label]="data.label"
          [hint]="data.hint ?? ''"
          [formField]="valueForm.value"
        />
      </form>
      <button
        sheetFooter
        appButton
        type="submit"
        size="block"
        [attr.form]="formId"
        [attr.data-testid]="data.testId + '.submit'"
        [disabled]="valueForm().invalid()"
      >
        {{ data.submitLabel }}
      </button>
    </app-bottom-sheet>
  `,
})
export class TextInputSheetComponent {
  private readonly dialogRef = inject<DialogRef<string>>(DialogRef)
  protected readonly data = inject<TextInputSheetData>(DIALOG_DATA)
  protected readonly formId = `text-input-sheet-${this.data.testId}`

  private readonly messages = formMessages()
  protected readonly model = signal({ value: this.data.value ?? '' })
  protected readonly valueForm = form(this.model, (path) => {
    required(path.value, { message: () => this.messages.required() })
    email(path.value, {
      message: () => this.messages.email(),
      when: () => this.data.type === 'email',
    })
  })

  protected submit(event: Event): void {
    event.preventDefault()
    if (this.valueForm().invalid()) {
      return
    }
    const value = this.model().value.trim()
    this.dialogRef.close(this.data.type === 'email' ? value.toLowerCase() : value)
  }
}
