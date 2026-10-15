import { Component, computed, inject, input, model } from '@angular/core'
import { TranslocoPipe, TranslocoService, translateSignal } from '@jsverse/transloco'
import { IconComponent } from '../../../../shared/icons/icon.component'
import { AmountDisplayComponent } from '../../../../shared/ui/amount-display/amount-display.component'
import { AmountKeypadComponent } from '../../../../shared/ui/amount-keypad/amount-keypad.component'
import { BottomSheetService } from '../../../../shared/ui/bottom-sheet/bottom-sheet.service'
import { ChipComponent } from '../../../../shared/ui/chip/chip.component'
import {
  openSelectSheet,
  type SelectOption,
} from '../../../../shared/ui/select-sheet/select-sheet.component'
import { TextFieldComponent } from '../../../../shared/ui/text-field/text-field.component'
import { provideTransactionsScope } from '../../transactions.scope'

/** What the transfer form edits: a positive amount between two of the household's accounts. */
export interface TransferDraft {
  fromAccountId: number | null
  toAccountId: number | null
  amountCents: number
  date: string
  memo: string
}

/**
 * Keys read from TypeScript (translateSignal() takes them relative to the
 * scope this component provides; sheet titles take full keys):
 * t(transactions.transfer.chooseAccount, transactions.transfer.sameAccount)
 * t(transactions.transfer.fromTitle, transactions.transfer.toTitle)
 */
const WORD_KEYS = ['transfer.chooseAccount', 'transfer.sameAccount']
const TITLE_KEYS = {
  fromAccountId: 'transactions.transfer.fromTitle',
  toAccountId: 'transactions.transfer.toTitle',
}

export const EMPTY_TRANSFER: TransferDraft = {
  fromAccountId: null,
  toAccountId: null,
  amountCents: 0,
  date: '',
  memo: '',
}

/** Both accounts, different from each other, an amount and a date. */
export function transferDraftValid(draft: TransferDraft): boolean {
  return (
    draft.fromAccountId !== null &&
    draft.toAccountId !== null &&
    draft.fromAccountId !== draft.toAccountId &&
    draft.amountCents > 0 &&
    draft.date !== ''
  )
}

/**
 * The transfer form (from and to accounts, amount from the keypad, date,
 * memo), shared by the edit sheet and quick add. A transfer never counts
 * as income or spending; both legs are written by the API.
 */
@Component({
  selector: 'app-transfer-form',
  providers: [provideTransactionsScope()],
  imports: [
    AmountDisplayComponent,
    AmountKeypadComponent,
    ChipComponent,
    IconComponent,
    TextFieldComponent,
    TranslocoPipe,
  ],
  template: `
    <div class="flex flex-col items-center gap-1 px-4">
      <button
        type="button"
        class="rounded-md px-2"
        data-testid="transactions.transfer.amount"
        [attr.aria-expanded]="keypadOpen()"
        [attr.aria-label]="'transactions.form.amount' | transloco"
        (click)="keypadOpen.set(!keypadOpen())"
      >
        <app-amount-display variant="hero" [cents]="draft().amountCents" />
      </button>
      @if (errors()['amountCents']; as message) {
        <p class="flex items-center gap-1.5 text-label text-status-critical">
          <app-icon name="circle-alert" [size]="16" />{{ message }}
        </p>
      } @else if (!keypadOpen()) {
        <p class="text-caption text-ink-3">{{ 'transactions.form.amountHint' | transloco }}</p>
      }
    </div>
    @if (keypadOpen()) {
      <app-amount-keypad
        [value]="draft().amountCents"
        (valueChange)="patch({ amountCents: $event })"
      />
    }

    <div class="flex flex-col gap-2 px-4">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-label text-ink-2">{{ 'transactions.transfer.from' | transloco }}</span>
        <button
          appChip
          trailing="chevron-down"
          data-testid="transactions.transfer.from"
          (click)="choose('fromAccountId')"
        >
          {{ accountName(draft().fromAccountId) }}
        </button>
        <app-icon name="arrow-left-right" class="text-ink-3" />
        <span class="text-label text-ink-2">{{ 'transactions.transfer.to' | transloco }}</span>
        <button
          appChip
          trailing="chevron-down"
          data-testid="transactions.transfer.to"
          (click)="choose('toAccountId')"
        >
          {{ accountName(draft().toAccountId) }}
        </button>
      </div>
      @if (accountError(); as message) {
        <p class="flex items-center gap-1.5 text-label text-status-critical">
          <app-icon name="circle-alert" [size]="16" />{{ message }}
        </p>
      }
    </div>

    <label class="flex flex-col gap-2 px-4">
      <span class="text-label text-ink-2">{{ 'transactions.form.date' | transloco }}</span>
      <input
        type="date"
        class="h-12 w-full rounded-md border border-line-strong bg-surface-1 px-4 text-body text-ink-1 tnum focus-visible:outline-none focus:border-2 focus:border-accent focus:px-[15px]"
        data-testid="transactions.transfer.date"
        [value]="draft().date"
        (change)="onDate($event)"
      />
      @if (errors()['date']; as message) {
        <span class="flex items-center gap-1.5 text-label text-status-critical">
          <app-icon name="circle-alert" [size]="16" />{{ message }}
        </span>
      }
    </label>

    <app-text-field
      class="px-4"
      data-testid="transactions.transfer.memo"
      autocomplete="off"
      [label]="'transactions.transfer.memo' | transloco"
      [error]="errors()['memo'] ?? ''"
      [value]="draft().memo"
      (valueChange)="patch({ memo: $event })"
    />
  `,
  host: { class: 'flex flex-col gap-5' },
})
export class TransferFormComponent {
  private readonly sheets = inject(BottomSheetService)
  private readonly transloco = inject(TranslocoService)

  readonly draft = model<TransferDraft>(EMPTY_TRANSFER)
  readonly accounts = input<readonly SelectOption<number>[]>([])
  /** A 422's `{ field: message }`, keyed by API field. */
  readonly errors = input<Record<string, string>>({})
  readonly keypadOpen = model(false)

  private readonly words = translateSignal(WORD_KEYS)

  readonly valid = computed(() => transferDraftValid(this.draft()))

  protected readonly accountError = computed(() => {
    const draft = this.draft()
    const server = this.errors()['toAccountId'] ?? this.errors()['fromAccountId']
    if (server) {
      return server
    }
    return draft.fromAccountId !== null && draft.fromAccountId === draft.toAccountId
      ? (this.words()[1] ?? '')
      : ''
  })

  protected accountName(id: number | null): string {
    return this.accounts().find((option) => option.value === id)?.label ?? this.words()[0] ?? ''
  }

  protected patch(changes: Partial<TransferDraft>): void {
    this.draft.update((draft) => ({ ...draft, ...changes }))
  }

  protected choose(field: 'fromAccountId' | 'toAccountId'): void {
    openSelectSheet(this.sheets, {
      title: this.transloco.translate(TITLE_KEYS[field]),
      options: this.accounts(),
      selected: this.draft()[field],
    }).subscribe((accountId) => {
      if (accountId !== undefined) {
        this.patch({ [field]: accountId })
      }
    })
  }

  protected onDate(event: Event): void {
    const value = (event.target as HTMLInputElement).value
    if (value) {
      this.patch({ date: value })
    }
  }
}
