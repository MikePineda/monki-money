import { DialogRef } from '@angular/cdk/dialog'
import { Component, inject, signal } from '@angular/core'
import { FormField, form, required } from '@angular/forms/signals'
import { TranslocoPipe } from '@jsverse/transloco'
import { formMessages } from '../../../core/i18n/form-messages'
import { BottomSheetComponent } from '../../../shared/ui/bottom-sheet/bottom-sheet.component'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { TextFieldComponent } from '../../../shared/ui/text-field/text-field.component'

/** Asks for the name of an account that is not among the presets; closes with it. */
@Component({
  selector: 'app-other-account-sheet',
  imports: [BottomSheetComponent, ButtonComponent, FormField, TextFieldComponent, TranslocoPipe],
  template: `
    <app-bottom-sheet
      [title]="'onboarding.accounts.otherSheet.title' | transloco"
      [closeLabel]="'ui.sheet.close' | transloco"
    >
      <form id="other-account" class="px-4 pb-2" novalidate (submit)="add($event)">
        <app-text-field
          data-testid="onboarding.otherName"
          autocomplete="off"
          [label]="'onboarding.accounts.otherSheet.name' | transloco"
          [formField]="nameForm.name"
        />
      </form>
      <button
        sheetFooter
        appButton
        type="submit"
        form="other-account"
        size="block"
        data-testid="onboarding.otherAdd"
        [disabled]="nameForm().invalid()"
      >
        {{ 'onboarding.accounts.otherSheet.add' | transloco }}
      </button>
    </app-bottom-sheet>
  `,
})
export class OtherAccountSheetComponent {
  private readonly dialogRef = inject<DialogRef<string>>(DialogRef)

  private readonly messages = formMessages()
  protected readonly model = signal({ name: '' })
  protected readonly nameForm = form(this.model, (path) => {
    required(path.name, { message: () => this.messages.required() })
  })

  protected add(event: Event): void {
    event.preventDefault()
    const name = this.model().name.trim()
    if (name) {
      this.dialogRef.close(name)
    }
  }
}
