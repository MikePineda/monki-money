import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { Component, computed, inject, signal } from '@angular/core'
import { FormField, form, required } from '@angular/forms/signals'
import { TranslocoPipe } from '@jsverse/transloco'
import { formMessages } from '../../../core/i18n/form-messages'
import { BottomSheetComponent } from '../../../shared/ui/bottom-sheet/bottom-sheet.component'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { TextFieldComponent } from '../../../shared/ui/text-field/text-field.component'
import type { DeleteOutcome } from './delete-household-sheet.component'

export interface TransferOwnershipSheetData {
  /** The member who would become the owner. */
  memberName: string
  /** Hands the household over; resolves to null on success (the sheet then closes). */
  confirm: (password: string) => Promise<DeleteOutcome>
}

/**
 * The confirmation before the owner makes their partner the owner: what
 * changes (the partner manages the household, the owner stays as a
 * member and may then leave) and the owner's password, which the API
 * checks again.
 */
@Component({
  selector: 'app-transfer-ownership-sheet',
  imports: [BottomSheetComponent, ButtonComponent, FormField, TextFieldComponent, TranslocoPipe],
  template: `
    <app-bottom-sheet
      [title]="'settings.household.ownerSheet.title' | transloco: { name: data.memberName }"
      [closeLabel]="'ui.sheet.close' | transloco"
    >
      <form
        id="transfer-ownership"
        class="flex flex-col gap-4 px-4 pb-2"
        novalidate
        (submit)="submit($event)"
      >
        <p class="text-body text-ink-2">
          {{ 'settings.household.ownerSheet.body' | transloco: { name: data.memberName } }}
        </p>
        <app-text-field
          data-testid="ownership.password"
          type="password"
          autocomplete="current-password"
          [label]="'settings.household.ownerSheet.password' | transloco"
          [formField]="ownershipForm.password"
          [error]="passwordError()"
        />
        @if (generalError(); as message) {
          <p class="text-label text-status-critical" role="alert">{{ message }}</p>
        }
      </form>
      <button
        sheetFooter
        appButton
        type="submit"
        form="transfer-ownership"
        size="block"
        data-testid="ownership.confirm"
        [disabled]="!canConfirm()"
        [loading]="saving()"
      >
        {{ 'settings.household.ownerSheet.confirm' | transloco: { name: data.memberName } }}
      </button>
    </app-bottom-sheet>
  `,
})
export class TransferOwnershipSheetComponent {
  private readonly dialogRef = inject<DialogRef<boolean>>(DialogRef)
  protected readonly data = inject<TransferOwnershipSheetData>(DIALOG_DATA)

  private readonly messages = formMessages()
  protected readonly model = signal({ password: '' })
  protected readonly ownershipForm = form(this.model, (path) => {
    required(path.password, { message: () => this.messages.required() })
  })

  protected readonly saving = signal(false)
  private readonly outcome = signal<DeleteOutcome>(null)
  protected readonly passwordError = computed(() => {
    const outcome = this.outcome()
    return outcome?.field === 'password' ? outcome.message : ''
  })
  protected readonly generalError = computed(() => {
    const outcome = this.outcome()
    return outcome?.field === 'general' ? outcome.message : ''
  })
  protected readonly canConfirm = computed(() => !this.ownershipForm().invalid() && !this.saving())

  protected async submit(event: Event): Promise<void> {
    event.preventDefault()
    if (!this.canConfirm()) {
      return
    }
    this.saving.set(true)
    this.outcome.set(null)
    const outcome = await this.data.confirm(this.model().password)
    this.saving.set(false)
    if (outcome) {
      this.outcome.set(outcome)
    } else {
      this.dialogRef.close(true)
    }
  }
}
