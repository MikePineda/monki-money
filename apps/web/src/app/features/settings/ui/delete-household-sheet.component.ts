import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { Component, computed, inject, signal } from '@angular/core'
import { FormField, form, required } from '@angular/forms/signals'
import { TranslocoPipe } from '@jsverse/transloco'
import { formMessages } from '../../../core/i18n/form-messages'
import { BottomSheetComponent } from '../../../shared/ui/bottom-sheet/bottom-sheet.component'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { TextFieldComponent } from '../../../shared/ui/text-field/text-field.component'

/** What the sheet reports back from a delete attempt: a field error, or a general one. */
export type DeleteOutcome = null | { field: 'password' | 'general'; message: string }

export interface DeleteHouseholdSheetData {
  householdName: string
  /** Performs the deletion; resolves to null on success (the sheet then closes). */
  confirm: (password: string) => Promise<DeleteOutcome>
}

/**
 * The final confirmation for deleting the household (DESIGN.md, Button:
 * destructive): type the household's name and your password. The API keeps
 * the household restorable for 30 days.
 */
@Component({
  selector: 'app-delete-household-sheet',
  imports: [BottomSheetComponent, ButtonComponent, FormField, TextFieldComponent, TranslocoPipe],
  template: `
    <app-bottom-sheet
      [title]="'settings.danger.sheet.title' | transloco"
      [closeLabel]="'ui.sheet.close' | transloco"
    >
      <form
        id="delete-household"
        class="flex flex-col gap-4 px-4 pb-2"
        novalidate
        (submit)="submit($event)"
      >
        <p class="text-body text-ink-2">
          {{ 'settings.danger.sheet.body' | transloco: { name: data.householdName } }}
        </p>
        <app-text-field
          data-testid="danger.confirmName"
          autocomplete="off"
          [label]="'settings.danger.sheet.typeName' | transloco: { name: data.householdName }"
          [formField]="deleteForm.name"
        />
        <app-text-field
          data-testid="danger.password"
          type="password"
          autocomplete="current-password"
          [label]="'settings.danger.sheet.password' | transloco"
          [formField]="deleteForm.password"
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
        form="delete-household"
        variant="destructive"
        size="block"
        data-testid="danger.confirmDelete"
        [disabled]="!canDelete()"
        [loading]="deleting()"
      >
        {{ 'settings.danger.sheet.confirm' | transloco }}
      </button>
    </app-bottom-sheet>
  `,
})
export class DeleteHouseholdSheetComponent {
  private readonly dialogRef = inject<DialogRef<boolean>>(DialogRef)
  protected readonly data = inject<DeleteHouseholdSheetData>(DIALOG_DATA)

  private readonly messages = formMessages()
  protected readonly model = signal({ name: '', password: '' })
  protected readonly deleteForm = form(this.model, (path) => {
    required(path.name, { message: () => this.messages.required() })
    required(path.password, { message: () => this.messages.required() })
  })

  protected readonly deleting = signal(false)
  private readonly outcome = signal<DeleteOutcome>(null)
  protected readonly passwordError = computed(() => {
    const outcome = this.outcome()
    return outcome?.field === 'password' ? outcome.message : ''
  })
  protected readonly generalError = computed(() => {
    const outcome = this.outcome()
    return outcome?.field === 'general' ? outcome.message : ''
  })
  protected readonly canDelete = computed(
    () =>
      !this.deleteForm().invalid() &&
      this.model().name.trim() === this.data.householdName.trim() &&
      !this.deleting()
  )

  protected async submit(event: Event): Promise<void> {
    event.preventDefault()
    if (!this.canDelete()) {
      return
    }
    this.deleting.set(true)
    this.outcome.set(null)
    const outcome = await this.data.confirm(this.model().password)
    this.deleting.set(false)
    if (outcome) {
      this.outcome.set(outcome)
    } else {
      this.dialogRef.close(true)
    }
  }
}
