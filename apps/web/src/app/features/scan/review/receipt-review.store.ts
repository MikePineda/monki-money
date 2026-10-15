import { Injectable, computed, inject, signal } from '@angular/core'
import { failureMessage } from '../../../core/api/error-messages'
import { toApiError } from '../../../core/api/http-errors'
import { HouseholdDirectory } from '../../../core/household/household-directory.store'
import { MonthStore } from '../../../core/month/month.store'
import { newClientId } from '../../../core/platform/client-id'
import { readLastAccount, rememberLastAccount } from '../../../core/platform/last-account'
import { HOUSEHOLD_TIME_ZONE } from '../../../core/platform/time-zone.token'
import { WINDOW } from '../../../core/platform/window.token'
import { ToastStore } from '../../../core/ui/toast.store'
import { monthOf, todayIn } from '../../../domain/month'
import { defaultAccountFor } from '../../../domain/quick-add-defaults'
import {
  categorizeLines,
  confidenceLevel,
  dropLines,
  linesFromReceipt,
  linesIssues,
  mergeLines,
  receiptAmount,
  receiptDate,
  receiptSplits,
  settledLines,
  type ReceiptConfidence,
  type ReceiptDraft,
  type ReceiptLine,
} from '../../../domain/receipt-draft'
import type { ReviewKey } from '../../../shared/review/review-list.component'
import {
  draftToCreate,
  type TransactionDraft,
} from '../../../shared/transaction-form/transaction-draft'
import { EMPTY_DRAFT } from '../../../shared/transaction-form/transaction-form.component'
import { ReceiptsApi, type ReceiptTransactionInput } from '../data-access/receipts.api'

/** The payee field's limit (the shared form's `maxLength`). */
const PAYEE_MAX = 120

/**
 * Toasts are translated where they render. Declared for
 * transloco-keys-manager: t(scan.toast.saved, scan.review.offline)
 */
const TOAST_KEYS = { saved: 'scan.toast.saved', offline: 'scan.review.offline' } as const

export type ReviewLoadState = 'loading' | 'ready' | 'error'

/**
 * The review half of the receipt scanner: the scanned draft as an ordinary
 * expense in the shared transaction form, or split by its printed lines.
 * Provided by the review component.
 *
 * - Opens with the receipt's merchant (payee), date (today when missing or
 *   later than today), total (the lines' sum when unreadable) and category
 *   (only one the household offers for expenses), the account this person
 *   last used on this device and "you" as the payer.
 * - Split by lines: each line becomes a split line (its words as the memo)
 *   with the receipt's category, or the one picked on the form; lines can
 *   be merged, dropped or given a category; the last line takes whatever
 *   is left of the total.
 * - Saving posts `POST /transactions` with `source: 'receipt'` and a client
 *   id kept for the whole review, so a retry after a lost answer never
 *   creates it twice. It needs the network: offline it says so and keeps
 *   the draft (receipts never go to the outbox, which has no splits).
 */
@Injectable()
export class ReceiptReviewStore {
  private readonly api = inject(ReceiptsApi)
  private readonly months = inject(MonthStore)
  private readonly toasts = inject(ToastStore)
  private readonly window = inject(WINDOW)
  private readonly timeZone = inject(HOUSEHOLD_TIME_ZONE)
  readonly directory = inject(HouseholdDirectory)

  readonly receipt = signal<ReceiptDraft | null>(null)
  /** What the shared transaction form edits. */
  readonly entry = signal<TransactionDraft>(EMPTY_DRAFT)
  readonly splitByLines = signal(false)
  readonly lines = signal<ReceiptLine[]>([])
  readonly selection = signal<ReadonlySet<ReviewKey>>(new Set())
  readonly loadState = signal<ReviewLoadState>('loading')
  readonly saving = signal(false)
  /** 422 messages by API field. */
  readonly fieldErrors = signal<Record<string, string>>({})

  readonly today = computed(() => todayIn(this.timeZone()))
  readonly youId = computed(() => this.directory.youId())
  readonly confidence = computed<ReceiptConfidence>(() => {
    const receipt = this.receipt()
    return receipt ? confidenceLevel(receipt.confidence) : 'high'
  })
  readonly canSplit = computed(() => (this.receipt()?.items.length ?? 0) >= 2)

  /** The lines as they will be saved (the last one takes what is left of the total). */
  readonly settled = computed(() => settledLines(this.entry().amountCents, this.lines()))
  /** What the last line absorbs: the total minus the printed lines (0 when they agree). */
  readonly differenceCents = computed(
    () =>
      this.entry().amountCents - this.lines().reduce((sum, line) => sum + line.amountCents, 0)
  )
  readonly issues = computed(() =>
    this.splitByLines() ? linesIssues(this.entry().amountCents, this.lines()) : []
  )

  readonly canSave = computed(() => {
    const entry = this.entry()
    return (
      this.loadState() === 'ready' &&
      !this.saving() &&
      entry.amountCents > 0 &&
      entry.accountId !== null &&
      entry.date !== '' &&
      this.issues().length === 0
    )
  })

  /** The amount as the save button repeats it ("−$23.45"). */
  readonly signedCents = computed(() => {
    const entry = this.entry()
    return entry.kind === 'expense' ? -entry.amountCents : entry.amountCents
  })

  private clientId = newClientId()

  /** Opens the review of a scanned receipt (waits for the household's accounts and categories). */
  async start(receipt: ReceiptDraft): Promise<void> {
    this.receipt.set(receipt)
    this.clientId = newClientId()
    this.splitByLines.set(false)
    this.selection.set(new Set())
    this.fieldErrors.set({})
    this.loadState.set('loading')
    try {
      await this.directory.load()
    } catch {
      this.loadState.set('error')
      return
    }
    const categoryId = this.offeredCategory(receipt.categoryId)
    this.entry.set({
      ...EMPTY_DRAFT,
      kind: 'expense',
      amountCents: receiptAmount(receipt),
      accountId: this.defaultAccount(),
      paidByUserId: this.youId(),
      categoryId,
      date: receiptDate(receipt, this.today()),
      payee: (receipt.merchant ?? '').trim().slice(0, PAYEE_MAX),
    })
    this.lines.set(linesFromReceipt(receipt, categoryId))
    this.loadState.set('ready')
  }

  /** Retries opening after the household data failed to load. */
  retry(): Promise<void> {
    const receipt = this.receipt()
    return receipt ? this.start(receipt) : Promise.resolve()
  }

  /** "Split by lines": lines without a category take the form's category. */
  toggleSplit(on: boolean): void {
    if (on && !this.canSplit()) {
      return
    }
    this.splitByLines.set(on)
    this.selection.set(new Set())
    if (on) {
      const categoryId = this.entry().categoryId
      this.lines.update((lines) =>
        lines.map((line) => (line.categoryId === null ? { ...line, categoryId } : line))
      )
    }
  }

  setLineCategory(id: number, categoryId: number | null): void {
    this.lines.update((lines) => categorizeLines(lines, new Set([id]), categoryId))
  }

  dropLine(id: number): void {
    this.lines.update((lines) => dropLines(lines, new Set([id])))
    this.selection.update((selection) => withoutKey(selection, id))
  }

  mergeSelected(): void {
    this.lines.update((lines) => mergeLines(lines, this.selectedIds()))
    this.selection.set(new Set())
  }

  dropSelected(): void {
    this.lines.update((lines) => dropLines(lines, this.selectedIds()))
    this.selection.set(new Set())
  }

  categorizeSelected(categoryId: number | null): void {
    this.lines.update((lines) => categorizeLines(lines, this.selectedIds(), categoryId))
    this.selection.set(new Set())
  }

  /** Saves the reviewed receipt; resolves true when it is in the ledger. */
  async save(): Promise<boolean> {
    if (!this.canSave()) {
      return false
    }
    const body = this.createBody()
    this.saving.set(true)
    this.fieldErrors.set({})
    try {
      const saved = await this.api.save(body)
      const youId = this.youId()
      if (youId !== null) {
        rememberLastAccount(this.window, youId, saved.accountId)
      }
      this.vibrate()
      this.months.invalidate(monthOf(saved.date))
      this.toasts.show({ messageKey: TOAST_KEYS.saved })
      return true
    } catch (error) {
      this.afterFailure(error)
      return false
    } finally {
      this.saving.set(false)
    }
  }

  private createBody(): ReceiptTransactionInput {
    const entry = this.entry()
    const { categoryId, ...base } = draftToCreate(entry, this.clientId)
    if (this.splitByLines()) {
      return { ...base, splits: receiptSplits(entry.amountCents, this.lines()), source: 'receipt' }
    }
    return { ...base, categoryId, source: 'receipt' }
  }

  private afterFailure(error: unknown): void {
    const failure = toApiError(error)
    switch (failure.kind) {
      case 'validation':
        this.fieldErrors.set(failure.fields)
        return
      case 'offline':
        this.toasts.show({ messageKey: TOAST_KEYS.offline, status: 'critical' })
        return
      case 'unauthorized':
        // The session store already sends the person to the login screen.
        return
      default: {
        const message = failureMessage(failure)
        this.toasts.show({ messageKey: message.key, params: message.params, status: 'critical' })
      }
    }
  }

  /** The receipt's category when the household offers it for expenses, else none. */
  private offeredCategory(categoryId: number | null): number | null {
    const offered = this.directory
      .categoriesOf('expense')
      .some((entry) => entry.category.id === categoryId)
    return offered ? categoryId : null
  }

  private defaultAccount(): number | null {
    const youId = this.youId()
    const accounts = this.directory.accounts()
    if (youId === null) {
      return this.directory.activeAccounts()[0]?.id ?? null
    }
    return defaultAccountFor(youId, [], accounts, readLastAccount(this.window, youId))
  }

  private selectedIds(): ReadonlySet<number> {
    return new Set(
      [...this.selection()].filter((key): key is number => typeof key === 'number')
    )
  }

  private vibrate(): void {
    const navigator = this.window.navigator
    if ('vibrate' in navigator) {
      navigator.vibrate(10)
    }
  }
}

function withoutKey(selection: ReadonlySet<ReviewKey>, key: ReviewKey): ReadonlySet<ReviewKey> {
  const next = new Set(selection)
  next.delete(key)
  return next
}
