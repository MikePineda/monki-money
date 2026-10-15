import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { Component, inject, signal } from '@angular/core'
import { FormField, form, pattern, required } from '@angular/forms/signals'
import { TranslocoPipe, translateSignal } from '@jsverse/transloco'
import { formMessages } from '../../../core/i18n/form-messages'
import { BottomSheetComponent } from '../../../shared/ui/bottom-sheet/bottom-sheet.component'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import {
  SegmentedControlComponent,
  type SegmentOption,
} from '../../../shared/ui/segmented-control/segmented-control.component'
import { TextFieldComponent } from '../../../shared/ui/text-field/text-field.component'

/** Scoped key used from TypeScript: t(settings.accounts.cards.suffixHint) */
const SUFFIX_RULE_KEY = 'accounts.cards.suffixHint'

export interface CardSheetData {
  /** Who carries the card (the household's members). */
  holders: readonly SegmentOption<number>[]
}

export interface CardSheetResult {
  cardSuffix: string
  userId: number
}

/** Adds a card to a joint account: the last digits printed on it and who carries it. */
@Component({
  selector: 'app-card-sheet',
  imports: [
    BottomSheetComponent,
    ButtonComponent,
    FormField,
    SegmentedControlComponent,
    TextFieldComponent,
    TranslocoPipe,
  ],
  template: `
    <app-bottom-sheet
      [title]="'settings.accounts.cards.sheetTitle' | transloco"
      [closeLabel]="'ui.sheet.close' | transloco"
    >
      <form
        id="card-sheet"
        class="flex flex-col gap-4 px-4 pb-2"
        novalidate
        (submit)="save($event)"
      >
        <app-text-field
          data-testid="cardSheet.suffix"
          autocomplete="off"
          [label]="'settings.accounts.cards.suffix' | transloco"
          [hint]="'settings.accounts.cards.suffixHint' | transloco"
          [formField]="cardForm.cardSuffix"
        />
        @if (data.holders.length > 0) {
          <div class="flex flex-col gap-2">
            <span class="text-label text-ink-2">{{
              'settings.accounts.cards.holder' | transloco
            }}</span>
            <app-segmented-control
              [label]="'settings.accounts.cards.holder' | transloco"
              [options]="data.holders"
              [(value)]="holder"
            />
          </div>
        }
      </form>
      <button
        sheetFooter
        appButton
        type="submit"
        form="card-sheet"
        size="block"
        data-testid="cardSheet.save"
        [disabled]="cardForm().invalid()"
      >
        {{ 'settings.accounts.cards.add' | transloco }}
      </button>
    </app-bottom-sheet>
  `,
})
export class CardSheetComponent {
  private readonly dialogRef = inject<DialogRef<CardSheetResult>>(DialogRef)
  protected readonly data = inject<CardSheetData>(DIALOG_DATA)

  private readonly messages = formMessages()
  // Relative key: the opener's "settings" scope is inherited and prefixed.
  private readonly suffixRule = translateSignal(SUFFIX_RULE_KEY)
  protected readonly model = signal({ cardSuffix: '' })
  protected readonly cardForm = form(this.model, (path) => {
    required(path.cardSuffix, { message: () => this.messages.required() })
    pattern(path.cardSuffix, /^[A-Za-z0-9]{2,8}$/, { message: () => this.suffixRule() })
  })
  protected readonly holder = signal<number>(this.data.holders[0]?.value ?? 0)

  protected save(event: Event): void {
    event.preventDefault()
    if (this.cardForm().invalid()) {
      return
    }
    this.dialogRef.close({ cardSuffix: this.model().cardSuffix.trim(), userId: this.holder() })
  }
}
