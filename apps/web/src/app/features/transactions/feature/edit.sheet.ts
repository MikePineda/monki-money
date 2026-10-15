import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { Component, Injector, OnInit, computed, inject, signal, viewChild } from '@angular/core'
import { TranslocoPipe, TranslocoService, translateSignal } from '@jsverse/transloco'
import type { Transaction } from '../../../core/api/api-types'
import { failureMessage } from '../../../core/api/error-messages'
import { toApiError } from '../../../core/api/http-errors'
import { ToastStore } from '../../../core/ui/toast.store'
import { formatWeekdayDate } from '../../../domain/dates'
import { AmountDisplayComponent } from '../../../shared/ui/amount-display/amount-display.component'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'
import { BannerComponent } from '../../../shared/ui/banner/banner.component'
import { BottomSheetComponent } from '../../../shared/ui/bottom-sheet/bottom-sheet.component'
import { BottomSheetService } from '../../../shared/ui/bottom-sheet/bottom-sheet.service'
import { ButtonComponent } from '../../../shared/ui/button/button.component'
import type { SelectOption } from '../../../shared/ui/select-sheet/select-sheet.component'
import { SkeletonComponent } from '../../../shared/ui/skeleton/skeleton.component'
import { TransactionsStore, type TransferDetails } from '../transactions.store'
import {
  EMPTY_DRAFT,
  TransactionFormComponent,
} from '../ui/transaction-form/transaction-form.component'
import {
  draftFromTransaction,
  draftToPatch,
  type TransactionDraft,
} from '../ui/transaction-form/transaction-draft'
import {
  EMPTY_TRANSFER,
  TransferFormComponent,
  transferDraftValid,
  type TransferDraft,
} from '../ui/transfer-form/transfer-form.component'
import { SplitSheetComponent, type SplitSheetData } from './split.sheet'

/**
 * Keys read from TypeScript, relative to the list page's scope:
 * t(transactions.edit.title, transactions.edit.privateTitle, transactions.edit.transferTitle)
 * t(transactions.edit.editTransferTitle, transactions.people.you, transactions.people.joint)
 * t(transactions.edit.from, transactions.edit.to, transactions.edit.date)
 * t(transactions.edit.memo, transactions.edit.account, transactions.edit.paidBy)
 * and full keys for toasts and messages:
 * t(transactions.toast.saved, transactions.toast.splitSaved, transactions.toast.transferSaved)
 * t(transactions.toast.private)
 */
const WORD_KEYS = [
  'edit.title',
  'edit.privateTitle',
  'edit.transferTitle',
  'edit.editTransferTitle',
  'people.you',
  'people.joint',
  'edit.from',
  'edit.to',
  'edit.date',
  'edit.memo',
  'edit.account',
  'edit.paidBy',
]
const PRIVATE_KEY = 'transactions.toast.private'

export interface EditSheetData {
  id: number
}

type Mode = 'loading' | 'failed' | 'entry' | 'masked' | 'transfer' | 'transferEdit'

/**
 * The transaction sheet over the list (`/transactions/:id`):
 * - an expense or income opens the shared form, with split and delete;
 * - a transfer leg opens a read-only view of the transfer, and "Edit
 *   transfer" switches to the transfer form (legs never change one by one);
 * - a partner's private transaction is read-only ("Private").
 * Field errors from a 422 stay under their fields; the list updates
 * optimistically behind the sheet.
 */
@Component({
  selector: 'app-edit-sheet',
  imports: [
    AmountDisplayComponent,
    BannerComponent,
    BottomSheetComponent,
    ButtonComponent,
    SkeletonComponent,
    TransactionFormComponent,
    TransferFormComponent,
    TranslocoPipe,
  ],
  template: `
    <app-bottom-sheet [title]="title()" [closeLabel]="'ui.sheet.close' | transloco">
      <div class="flex flex-col gap-5 pb-4" data-testid="transactions.edit">
        @if (failure(); as message) {
          <app-banner class="mx-4" status="critical" [message]="message" />
        }
        @switch (mode()) {
          @case ('loading') {
            <app-skeleton class="mx-4" height="48px" />
            <app-skeleton class="mx-4" height="48px" />
          }
          @case ('entry') {
            <app-transaction-form
              splittable
              [(draft)]="draft"
              [(keypadOpen)]="keypadOpen"
              [accounts]="accountOptions()"
              [people]="peopleOptions()"
              [categories]="store.categories.options()"
              [payees]="store.payeeHistory()"
              [serverErrors]="errors()"
              [splitCount]="row()?.isSplit ? (row()?.splits?.length ?? 0) : 0"
              (splitRequested)="openSplit()"
            />
            <button
              appButton
              type="button"
              variant="destructive"
              class="mx-4"
              data-testid="transactions.edit.delete"
              [disabled]="saving()"
              (click)="remove()"
            >
              {{ 'transactions.edit.delete' | transloco }}
            </button>
          }
          @case ('masked') {
            <div class="flex flex-col items-center gap-2 px-4 text-center">
              <app-amount-display variant="hero" [cents]="row()?.amountCents ?? 0" />
              <p class="text-body text-ink-2" data-testid="transactions.edit.private">
                {{ 'transactions.edit.privateBody' | transloco: { name: payerName() } }}
              </p>
            </div>
            <dl class="flex flex-col px-4">
              @for (fact of facts(); track fact.label) {
                <div class="flex h-12 items-center justify-between gap-4 border-b border-line">
                  <dt class="text-label text-ink-2">{{ fact.label }}</dt>
                  <dd class="truncate text-body text-ink-1">{{ fact.value }}</dd>
                </div>
              }
            </dl>
          }
          @case ('transfer') {
            <div class="flex flex-col items-center gap-2 px-4">
              <app-amount-display variant="hero" [cents]="transfer()?.amountCents ?? 0" />
            </div>
            <dl class="flex flex-col px-4" data-testid="transactions.edit.transfer">
              @for (fact of facts(); track fact.label) {
                <div class="flex h-12 items-center justify-between gap-4 border-b border-line">
                  <dt class="text-label text-ink-2">{{ fact.label }}</dt>
                  <dd class="truncate text-body text-ink-1">{{ fact.value }}</dd>
                </div>
              }
            </dl>
            <button
              appButton
              type="button"
              variant="destructive"
              class="mx-4"
              data-testid="transactions.edit.deleteTransfer"
              (click)="remove()"
            >
              {{ 'transactions.edit.deleteTransfer' | transloco }}
            </button>
          }
          @case ('transferEdit') {
            <app-transfer-form
              [(draft)]="transferDraft"
              [(keypadOpen)]="keypadOpen"
              [accounts]="accountOptions()"
              [errors]="errors()"
            />
          }
          @case ('failed') {
            <p class="px-4 text-body text-ink-2">{{ 'transactions.edit.loadError' | transloco }}</p>
          }
        }
      </div>

      <div sheetFooter class="flex flex-col gap-2">
        @switch (mode()) {
          @case ('entry') {
            <button
              appButton
              type="button"
              size="block"
              data-testid="transactions.edit.save"
              [disabled]="!canSave()"
              [loading]="saving()"
              (click)="save()"
            >
              {{ 'transactions.edit.save' | transloco }}
            </button>
          }
          @case ('transfer') {
            <button
              appButton
              type="button"
              variant="secondary"
              icon="pencil"
              data-testid="transactions.edit.editTransfer"
              (click)="editTransfer()"
            >
              {{ 'transactions.edit.editTransfer' | transloco }}
            </button>
          }
          @case ('transferEdit') {
            <button
              appButton
              type="button"
              size="block"
              data-testid="transactions.edit.saveTransfer"
              [disabled]="!canSaveTransfer()"
              [loading]="saving()"
              (click)="saveTransfer()"
            >
              {{ 'transactions.edit.saveTransfer' | transloco }}
            </button>
          }
        }
      </div>
    </app-bottom-sheet>
  `,
})
export class EditSheetComponent implements OnInit {
  private readonly data = inject<EditSheetData>(DIALOG_DATA)
  private readonly dialogRef = inject(DialogRef)
  protected readonly store = inject(TransactionsStore)
  private readonly sheets = inject(BottomSheetService)
  private readonly toasts = inject(ToastStore)
  private readonly transloco = inject(TranslocoService)
  private readonly injector = inject(Injector)
  private readonly locale = inject(APP_LOCALE)

  private readonly form = viewChild(TransactionFormComponent)

  protected readonly mode = signal<Mode>('loading')
  protected readonly row = signal<Transaction | null>(null)
  protected readonly draft = signal<TransactionDraft>(EMPTY_DRAFT)
  protected readonly transfer = signal<TransferDetails | null>(null)
  protected readonly transferDraft = signal<TransferDraft>(EMPTY_TRANSFER)
  protected readonly keypadOpen = signal(false)
  protected readonly errors = signal<Record<string, string>>({})
  protected readonly failure = signal('')
  protected readonly saving = signal(false)

  private readonly words = translateSignal(WORD_KEYS)

  protected readonly title = computed(() => {
    const [entry = '', masked = '', transfer = '', editTransfer = ''] = this.words()
    switch (this.mode()) {
      case 'masked':
        return masked
      case 'transfer':
        return transfer
      case 'transferEdit':
        return editTransfer
      default:
        return entry
    }
  })

  protected readonly accountOptions = computed<SelectOption<number>[]>(() => {
    const accounts = this.store.accounts.hasValue() ? this.store.accounts.value() : []
    const current = this.row()?.accountId
    return accounts
      .filter((account) => account.isActive || account.id === current)
      .map((account) => ({ value: account.id, label: account.name, icon: 'wallet' as const }))
  })

  protected readonly peopleOptions = computed<SelectOption<number | null>[]>(() => {
    const words = this.words()
    return [
      ...this.store.members.people().map((person) => ({
        value: person.userId as number | null,
        label: person.isYou ? (words[4] ?? '') : person.name,
        person: person.person,
      })),
      { value: null, label: words[5] ?? '', person: 'joint' as const },
    ]
  })

  protected readonly payerName = computed(() => {
    const row = this.row()
    return this.store.members.find(row?.paidByUserId ?? null)?.name ?? ''
  })

  /** Read-only facts of a transfer or a private transaction. */
  protected readonly facts = computed(() => {
    const words = this.words()
    const name = (id: number | null | undefined) =>
      this.accountOptions().find((option) => option.value === id)?.label ??
      (this.store.accounts.hasValue()
        ? (this.store.accounts.value().find((account) => account.id === id)?.name ?? '')
        : '')
    const day = (date: string) => formatWeekdayDate(date, this.locale(), { withYear: true })
    const transfer = this.transfer()
    if (this.mode() === 'transfer' && transfer) {
      return [
        { label: words[6] ?? '', value: name(transfer.fromAccountId) },
        { label: words[7] ?? '', value: name(transfer.toAccountId) },
        { label: words[8] ?? '', value: day(transfer.date) },
        ...(transfer.memo ? [{ label: words[9] ?? '', value: transfer.memo }] : []),
      ]
    }
    const row = this.row()
    if (!row) {
      return []
    }
    return [
      { label: words[10] ?? '', value: name(row.accountId) },
      { label: words[8] ?? '', value: day(row.date) },
      { label: words[11] ?? '', value: this.payerName() || (words[5] ?? '') },
    ]
  })

  protected readonly canSave = computed(() => {
    const row = this.row()
    const draft = this.draft()
    if (!row || this.mode() !== 'entry' || this.saving()) {
      return false
    }
    const valid = this.form()?.valid() ?? false
    return valid && Object.keys(draftToPatch(row, draft)).length > 0
  })

  protected readonly canSaveTransfer = computed(
    () => !this.saving() && transferDraftValid(this.transferDraft())
  )

  async ngOnInit(): Promise<void> {
    try {
      const row = await this.store.find(this.data.id)
      this.row.set(row)
      if (row.isMasked) {
        this.mode.set('masked')
      } else if (row.transferId !== null) {
        this.transfer.set(await this.store.transferOf(row))
        this.mode.set('transfer')
      } else {
        this.draft.set(draftFromTransaction(row))
        this.mode.set('entry')
      }
    } catch {
      this.mode.set('failed')
    }
  }

  protected async save(): Promise<void> {
    const row = this.row()
    const draft = this.draft()
    if (!row || !this.canSave()) {
      return
    }
    await this.persist(async () => {
      await this.store.update(row, draftToPatch(row, draft))
      this.toasts.show({ messageKey: 'transactions.toast.saved', status: 'good' })
    })
  }

  protected async remove(): Promise<void> {
    const row = this.row()
    if (!row) {
      return
    }
    this.dialogRef.close()
    await this.store.remove(row)
  }

  protected openSplit(): void {
    const row = this.row()
    if (!row) {
      return
    }
    this.sheets
      .open<Transaction, SplitSheetData>(SplitSheetComponent, {
        data: { row },
        injector: this.injector,
      })
      .closed.subscribe((saved) => {
        if (saved) {
          this.row.set(saved)
          this.draft.update((draft) => ({ ...draft, categoryId: saved.categoryId }))
          this.toasts.show({ messageKey: 'transactions.toast.splitSaved', status: 'good' })
        }
      })
  }

  protected editTransfer(): void {
    const transfer = this.transfer()
    if (!transfer) {
      return
    }
    this.transferDraft.set({
      fromAccountId: transfer.fromAccountId,
      toAccountId: transfer.toAccountId,
      amountCents: transfer.amountCents,
      date: transfer.date,
      memo: transfer.memo ?? '',
    })
    this.mode.set('transferEdit')
  }

  protected async saveTransfer(): Promise<void> {
    const transfer = this.transfer()
    const draft = this.transferDraft()
    if (!transfer || !this.canSaveTransfer()) {
      return
    }
    await this.persist(async () => {
      await this.store.updateTransfer(transfer, {
        fromAccountId: draft.fromAccountId as number,
        toAccountId: draft.toAccountId as number,
        amountCents: draft.amountCents,
        date: draft.date,
        memo: draft.memo.trim() || null,
      })
      this.toasts.show({ messageKey: 'transactions.toast.transferSaved', status: 'good' })
    })
  }

  /** Runs a save: closes on success, keeps the sheet with the errors otherwise. */
  private async persist(change: () => Promise<void>): Promise<void> {
    this.saving.set(true)
    this.errors.set({})
    this.failure.set('')
    try {
      await change()
      this.dialogRef.close()
    } catch (error) {
      const failure = toApiError(error)
      if (failure.kind === 'validation') {
        this.errors.set(failure.fields)
      } else if (failure.kind === 'forbidden' && failure.code === 'E_TRANSACTION_PRIVATE') {
        this.failure.set(this.transloco.translate(PRIVATE_KEY))
      } else if (failure.kind !== 'unauthorized') {
        const message = failureMessage(failure)
        this.failure.set(this.transloco.translate(message.key, message.params))
      }
    } finally {
      this.saving.set(false)
    }
  }
}
