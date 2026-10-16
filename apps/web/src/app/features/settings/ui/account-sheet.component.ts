import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { Component, computed, inject, signal } from '@angular/core'
import { FormField, form, required } from '@angular/forms/signals'
import { TranslocoPipe, translateSignal } from '@jsverse/transloco'
import type { AccountInput } from '../../../core/household/accounts.api'
import { formMessages } from '../../../core/i18n/form-messages'
import type { AccountKind, OwnerChoice } from '../../../domain/account-presets'
import { BottomSheetComponent } from '../../../shared/ui/bottom-sheet/bottom-sheet.component'
import { BottomSheetService } from '../../../shared/ui/bottom-sheet/bottom-sheet.service'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import { ChipComponent } from '../../../shared/ui/chip/chip.component'
import {
  SegmentedControlComponent,
  type SegmentOption,
} from '../../../shared/ui/segmented-control/segmented-control.component'
import { openSelectSheet } from '../../../shared/ui/select-sheet/select-sheet.component'
import { TextFieldComponent } from '../../../shared/ui/text-field/text-field.component'
import {
  OpeningBalanceFieldComponent,
  signedOpeningBalance,
} from './opening-balance-field.component'

/** Scoped key used from TypeScript: t(settings.accounts.sheet.kind) */
const KIND_TITLE_KEY = 'accounts.sheet.kind'

export interface AccountSheetData {
  title: string
  /** Values of the account being edited; empty for a new one. */
  initial?: {
    name: string
    institution: string | null
    kind: AccountKind
    owner: OwnerChoice
    openingBalanceCents: number
    openingBalanceDate: string | null
  }
  isActive?: boolean
  kinds: readonly { value: AccountKind; label: string }[]
  owners: readonly SegmentOption<OwnerChoice>[]
}

export type AccountSheetResult =
  | { action: 'save'; input: Omit<AccountInput, 'ownerUserId'>; owner: OwnerChoice }
  | { action: 'archive' }
  | { action: 'restore' }

/**
 * Create or edit an account: name, institution, kind, owner and the opening
 * balance with its date (negative for a card or loan in debt). Editing also
 * offers archive (or restore): accounts are archived, never deleted, once
 * they may hold history.
 */
@Component({
  selector: 'app-account-sheet',
  imports: [
    BottomSheetComponent,
    ButtonComponent,
    ChipComponent,
    FormField,
    OpeningBalanceFieldComponent,
    SegmentedControlComponent,
    TextFieldComponent,
    TranslocoPipe,
  ],
  template: `
    <app-bottom-sheet [title]="data.title" [closeLabel]="'ui.sheet.close' | transloco">
      <form
        id="account-sheet"
        class="flex flex-col gap-4 px-4 pb-2"
        novalidate
        (submit)="save($event)"
      >
        <app-text-field
          data-testid="accountSheet.name"
          autocomplete="off"
          [label]="'settings.accounts.sheet.name' | transloco"
          [formField]="accountForm.name"
        />
        <app-text-field
          data-testid="accountSheet.institution"
          autocomplete="off"
          [label]="'settings.accounts.sheet.institution' | transloco"
          [hint]="'settings.accounts.sheet.optional' | transloco"
          [formField]="accountForm.institution"
        />
        <div class="flex flex-col gap-2">
          <span class="text-label text-ink-2">{{
            'settings.accounts.sheet.kind' | transloco
          }}</span>
          <button appChip trailing="chevron-down" class="self-start" (click)="chooseKind()">
            {{ kindLabel() }}
          </button>
        </div>
        <div class="flex flex-col gap-2">
          <span class="text-label text-ink-2">{{
            'settings.accounts.sheet.owner' | transloco
          }}</span>
          <app-segmented-control
            [label]="'settings.accounts.sheet.owner' | transloco"
            [options]="data.owners"
            [(value)]="owner"
          />
        </div>
        <app-opening-balance-field
          [(magnitude)]="openingMagnitude"
          [(owes)]="owes"
          [(date)]="openingDate"
          [(open)]="keypadOpen"
        />
      </form>
      <div sheetFooter class="flex flex-col gap-2">
        <button
          appButton
          type="submit"
          form="account-sheet"
          size="block"
          data-testid="accountSheet.save"
          [disabled]="accountForm().invalid()"
        >
          {{ 'settings.save' | transloco }}
        </button>
        @if (data.initial) {
          @if (data.isActive === false) {
            <button appButton type="button" variant="ghost" (click)="close({ action: 'restore' })">
              {{ 'settings.accounts.restore' | transloco }}
            </button>
          } @else {
            <button
              appButton
              type="button"
              variant="ghost"
              data-testid="accountSheet.archive"
              (click)="close({ action: 'archive' })"
            >
              {{ 'settings.accounts.archive' | transloco }}
            </button>
          }
        }
      </div>
    </app-bottom-sheet>
  `,
})
export class AccountSheetComponent {
  private readonly dialogRef = inject<DialogRef<AccountSheetResult>>(DialogRef)
  private readonly sheets = inject(BottomSheetService)
  protected readonly data = inject<AccountSheetData>(DIALOG_DATA)

  private readonly messages = formMessages()
  // Relative key: the opener's "settings" scope is inherited and prefixed.
  private readonly kindTitle = translateSignal(KIND_TITLE_KEY)
  protected readonly model = signal({
    name: this.data.initial?.name ?? '',
    institution: this.data.initial?.institution ?? '',
  })
  protected readonly accountForm = form(this.model, (path) => {
    required(path.name, { message: () => this.messages.required() })
  })
  protected readonly kind = signal<AccountKind>(this.data.initial?.kind ?? 'transaction')
  protected readonly owner = signal<OwnerChoice>(this.data.initial?.owner ?? 'joint')
  protected readonly openingMagnitude = signal(
    Math.abs(this.data.initial?.openingBalanceCents ?? 0)
  )
  protected readonly owes = signal((this.data.initial?.openingBalanceCents ?? 0) < 0)
  protected readonly openingDate = signal(this.data.initial?.openingBalanceDate ?? '')
  protected readonly keypadOpen = signal(false)
  protected readonly kindLabel = computed(
    () => this.data.kinds.find((kind) => kind.value === this.kind())?.label ?? ''
  )

  protected chooseKind(): void {
    openSelectSheet<AccountKind>(this.sheets, {
      title: this.kindTitle(),
      options: this.data.kinds,
      selected: this.kind(),
    }).subscribe((kind) => {
      if (kind) {
        this.kind.set(kind)
      }
    })
  }

  protected save(event: Event): void {
    event.preventDefault()
    if (this.accountForm().invalid()) {
      return
    }
    const { name, institution } = this.model()
    this.close({
      action: 'save',
      input: {
        name: name.trim(),
        institution: institution.trim() || null,
        kind: this.kind(),
        openingBalanceCents: signedOpeningBalance(this.openingMagnitude(), this.owes()),
        openingBalanceDate: this.openingDate() || null,
      },
      owner: this.owner(),
    })
  }

  protected close(result: AccountSheetResult): void {
    this.dialogRef.close(result)
  }
}
