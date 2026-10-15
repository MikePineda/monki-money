import { Injectable, computed, inject, signal } from '@angular/core'
import { failureMessage, type Message } from '../../../core/api/error-messages'
import type { Transaction } from '../../../core/api/api-types'
import { toApiError } from '../../../core/api/http-errors'
import { SessionStore } from '../../../core/auth/session.store'
import {
  HouseholdDirectory,
  type CategoryEntry,
} from '../../../core/household/household-directory.store'
import { TransactionsApi, type QuickEntryInput } from '../../../core/ledger/transactions.api'
import { MonthStore } from '../../../core/month/month.store'
import { newClientId } from '../../../core/platform/client-id'
import { readPreference, writePreference } from '../../../core/platform/local-preference'
import { HOUSEHOLD_TIME_ZONE } from '../../../core/platform/time-zone.token'
import { WINDOW } from '../../../core/platform/window.token'
import { ToastStore } from '../../../core/ui/toast.store'
import { monthOf, todayIn, type IsoDate } from '../../../domain/month'
import {
  QUICK_CATEGORY_COUNT,
  defaultAccountFor,
  defaultTransferPair,
  payeeSuggestions,
  rankCategories,
  transferPresets,
  type RecentEntry,
  type TransferPair,
} from '../../../domain/quick-add-defaults'
import type { TransactionDraft } from '../../../shared/transaction-form/transaction-draft'
import { EMPTY_DRAFT } from '../../../shared/transaction-form/transaction-form.component'
import {
  EMPTY_TRANSFER,
  transferDraftValid,
  type TransferDraft,
} from '../../../shared/transaction-form/transfer-form.component'

export type QuickKind = 'expense' | 'income' | 'transfer'
export type LoadState = 'loading' | 'ready' | 'error'

/** Rows read to rank categories, routes and payees (newest first). */
export const RECENT_ROWS = 100
/** Payees offered as suggestions (the form filters them by what is typed). */
const PAYEE_SUGGESTIONS = 20
/** localStorage keys, per person: the account last used for an expense or income. */
export const LAST_ACCOUNT_KEY = 'qa:account:'

const KINDS: readonly QuickKind[] = ['expense', 'income', 'transfer']

/**
 * Toasts are translated where they render. Declared for
 * transloco-keys-manager (scope keys): t(quickAdd.toast.saved, quickAdd.toast.undo, quickAdd.toast.undone)
 */
const TOAST_KEYS = {
  saved: 'quickAdd.toast.saved',
  undo: 'quickAdd.toast.undo',
  undone: 'quickAdd.toast.undone',
} as const

/** A saved entry, enough to undo it. */
interface Saved {
  kind: QuickKind
  id: number
  date: IsoDate
}

/** The exact request of one save attempt: a retry of the same draft reuses its client id. */
interface Attempt {
  fingerprint: string
  clientId: string
}

export function isQuickKind(value: unknown): value is QuickKind {
  return typeof value === 'string' && (KINDS as readonly string[]).includes(value)
}

type LedgerRow = Pick<
  Transaction,
  | 'id'
  | 'kind'
  | 'date'
  | 'accountId'
  | 'amountCents'
  | 'categoryId'
  | 'payee'
  | 'transferId'
  | 'createdByUserId'
>

function toRecentEntry(row: LedgerRow): RecentEntry {
  return {
    id: row.id,
    kind: row.kind,
    date: row.date,
    accountId: row.accountId,
    amountCents: row.amountCents,
    categoryId: row.categoryId,
    payee: row.payee,
    transferId: row.transferId,
    createdByUserId: row.createdByUserId,
  }
}

function text(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * Quick add's state and behaviour (the sacred screen, 3 taps ≈ 6 s): the
 * drafts the shared transaction and transfer forms edit, the defaults they
 * open with, and saving. Provided by the page.
 *
 * - Defaults: expense (or the `type` the link asked for), the account this
 *   person used last on this device (`qa:account:<userId>`), else their
 *   latest entry, else the first active account; "you" paid; today in the
 *   household time zone; no category (saving without one is allowed).
 * - Saving sends a client id generated per attempt; retrying the very same
 *   draft after a network failure reuses it, so the API never creates the
 *   row twice. A 422 maps to field errors; no connection keeps the draft
 *   and offers "Try again".
 * - After a save: a haptic tick, "Saved · Undo" (undo deletes it), the
 *   draft clears and the screen stays on /add for the next one.
 */
@Injectable()
export class QuickAddStore {
  private readonly api = inject(TransactionsApi)
  private readonly months = inject(MonthStore)
  private readonly toasts = inject(ToastStore)
  private readonly session = inject(SessionStore)
  private readonly window = inject(WINDOW)
  private readonly timeZone = inject(HOUSEHOLD_TIME_ZONE)
  readonly directory = inject(HouseholdDirectory)

  /* ----------------------------------------------------------- the drafts */

  readonly kind = signal<QuickKind>('expense')
  /** What the transaction form edits (expense or income). */
  readonly entry = signal<TransactionDraft>({ ...EMPTY_DRAFT, date: todayIn(this.timeZone()) })
  /** What the transfer form edits. */
  readonly transfer = signal<TransferDraft>({ ...EMPTY_TRANSFER, date: todayIn(this.timeZone()) })

  /* ---------------------------------------------------------- the screen */

  readonly loadState = signal<LoadState>('loading')
  readonly saving = signal(false)
  /** A failure that is not about a field: no connection, throttled, server error. */
  readonly failure = signal<Message | null>(null)
  /** 422 messages by API field (`amountCents`, `accountId`, `toAccountId`...). */
  readonly fieldErrors = signal<Record<string, string>>({})

  private readonly recent = signal<RecentEntry[]>([])
  private attempt: Attempt | null = null
  /** The "Saved · Undo" toast of the last save, while it may still be on screen. */
  private savedToast: number | null = null

  readonly today = computed(() => todayIn(this.timeZone()))
  readonly youId = computed(() => this.session.user()?.id ?? null)
  readonly hasAccounts = computed(() => this.directory.activeAccounts().length > 0)

  /** The amount on the keypad, shared by both drafts so switching type keeps it. */
  readonly amountCents = computed(() =>
    this.kind() === 'transfer' ? this.transfer().amountCents : this.entry().amountCents
  )
  /** The date of the draft on screen (the header chip). */
  readonly date = computed(() =>
    this.kind() === 'transfer' ? this.transfer().date : this.entry().date
  )

  /** The seven category tiles for the current kind; a category picked from "More" takes a slot. */
  readonly categoryTiles = computed<CategoryEntry[]>(() => {
    const kind = this.kind()
    if (kind === 'transfer') {
      return []
    }
    const candidates = this.directory.categoriesOf(kind)
    const ids = rankCategories(
      this.recent(),
      kind,
      this.today(),
      candidates.map((entry) => entry.category)
    )
    const selected = this.entry().categoryId
    if (selected !== null && !ids.includes(selected)) {
      ids.splice(QUICK_CATEGORY_COUNT - 1, 1)
      ids.unshift(selected)
    }
    return ids
      .map((id) => this.directory.category(id))
      .filter((entry): entry is CategoryEntry => entry !== null)
  })

  /** The most used transfer routes ("→ Savings"). */
  readonly presets = computed<TransferPair[]>(() =>
    transferPresets(this.recent(), this.directory.accounts(), this.today())
  )

  /** Recent payees of this kind, most used first (the form filters them as one types). */
  readonly payees = computed(() => {
    const kind = this.kind()
    return kind === 'transfer'
      ? []
      : payeeSuggestions(this.recent(), kind, '', this.today(), PAYEE_SUGGESTIONS)
  })

  readonly canSave = computed(() => {
    if (this.amountCents() <= 0 || this.saving() || this.loadState() !== 'ready') {
      return false
    }
    if (this.kind() === 'transfer') {
      return transferDraftValid(this.transfer())
    }
    const entry = this.entry()
    return entry.accountId !== null && entry.date !== ''
  })

  /** The amount as the save button repeats it: "−$42.50", "+$3,200.00", "$500.00". */
  readonly signedCents = computed(() => {
    const amount = this.amountCents()
    return this.kind() === 'expense' ? -amount : amount
  })

  /* ------------------------------------------------------------- loading */

  /** Loads the household's accounts, categories, members and recent rows, then applies the defaults. */
  async init(requestedKind: unknown): Promise<void> {
    if (isQuickKind(requestedKind)) {
      this.setKind(requestedKind)
    }
    this.loadState.set('loading')
    const loadedBefore = this.directory.status() === 'ready'
    try {
      const [, rows] = await Promise.all([
        this.directory.load(),
        this.api.list({ perPage: RECENT_ROWS, sort: '-date' }),
      ])
      this.recent.set(rows.map(toRecentEntry))
      this.applyDefaults()
      this.loadState.set('ready')
      if (loadedBefore) {
        // Loaded earlier in the session: pick up accounts or categories added since.
        this.directory.refreshInBackground()
      }
    } catch {
      this.loadState.set('error')
    }
  }

  private applyDefaults(): void {
    const youId = this.youId()
    const accountId =
      youId === null
        ? (this.directory.activeAccounts()[0]?.id ?? null)
        : defaultAccountFor(
            youId,
            this.recent(),
            this.directory.accounts(),
            this.storedAccount(youId)
          )
    const pair = defaultTransferPair(this.directory.accounts(), this.presets(), accountId)
    const today = this.today()
    this.entry.update((entry) => ({ ...entry, accountId, paidByUserId: youId, date: today }))
    this.transfer.update((transfer) => ({ ...transfer, ...pair, date: today }))
  }

  /** The account this person saved with last on this device, if any. */
  private storedAccount(userId: number): number | null {
    const raw = readPreference(this.window, `${LAST_ACCOUNT_KEY}${userId}`)
    return raw !== null && /^\d+$/.test(raw) ? Number(raw) : null
  }

  /* ------------------------------------------------------------- editing */

  setKind(kind: QuickKind): void {
    if (kind === this.kind()) {
      return
    }
    this.kind.set(kind)
    this.fieldErrors.set({})
    if (kind !== 'transfer') {
      // A category belongs to one side (expense or income).
      this.entry.update((entry) =>
        entry.kind === kind ? entry : { ...entry, kind, categoryId: null }
      )
    }
  }

  /** The keypad writes both drafts, so the amount survives a change of type. */
  setAmount(amountCents: number): void {
    this.entry.update((entry) => ({ ...entry, amountCents }))
    this.transfer.update((transfer) => ({ ...transfer, amountCents }))
  }

  /**
   * The next entry has started (a keypad press): the "Saved · Undo" toast
   * docks under the top bar, over the type segment, so it gets out of the way.
   */
  startNextEntry(): void {
    if (this.savedToast !== null) {
      this.toasts.dismiss(this.savedToast)
      this.savedToast = null
    }
  }

  /* -------------------------------------------------------------- saving */

  async save(): Promise<void> {
    if (!this.canSave()) {
      return
    }
    this.saving.set(true)
    this.failure.set(null)
    this.fieldErrors.set({})
    try {
      const saved = this.kind() === 'transfer' ? await this.saveTransfer() : await this.saveEntry()
      this.attempt = null
      this.afterSave(saved)
    } catch (error) {
      const failure = toApiError(error)
      if (failure.kind === 'validation') {
        this.fieldErrors.set(failure.fields)
      } else if (failure.kind !== 'unauthorized') {
        this.failure.set(failureMessage(failure))
      }
    } finally {
      this.saving.set(false)
    }
  }

  private async saveEntry(): Promise<Saved> {
    const entry = this.entry()
    const body: Omit<QuickEntryInput, 'clientId'> = {
      kind: entry.kind,
      amountCents: entry.amountCents,
      accountId: entry.accountId ?? undefined,
      date: entry.date,
      categoryId: entry.categoryId,
      payee: text(entry.payee),
      description: text(entry.description),
      paidByUserId: entry.paidByUserId,
      isPrivate: entry.isPrivate,
      tags: [...entry.tags],
    }
    const row = await this.api.quick({ clientId: this.clientIdFor(body), ...body })
    this.recent.update((rows) => [toRecentEntry(row), ...rows])
    const youId = this.youId()
    if (youId !== null) {
      writePreference(this.window, `${LAST_ACCOUNT_KEY}${youId}`, String(row.accountId))
    }
    return { kind: entry.kind, id: row.id, date: row.date }
  }

  private async saveTransfer(): Promise<Saved> {
    const transfer = this.transfer()
    const body = {
      fromAccountId: transfer.fromAccountId as number,
      toAccountId: transfer.toAccountId as number,
      date: transfer.date,
      amountCents: transfer.amountCents,
      memo: text(transfer.memo),
    }
    const saved = await this.api.transfer({ clientId: this.clientIdFor(body), ...body })
    this.recent.update((rows) => [...saved.legs.map(toRecentEntry), ...rows])
    return { kind: 'transfer', id: saved.id, date: saved.date }
  }

  /** The same draft retried keeps its id; any change makes it a new attempt. */
  private clientIdFor(body: object): string {
    const fingerprint = JSON.stringify(body)
    if (this.attempt?.fingerprint !== fingerprint) {
      this.attempt = { fingerprint, clientId: newClientId() }
    }
    return this.attempt.clientId
  }

  private afterSave(saved: Saved): void {
    const navigator = this.window.navigator
    if ('vibrate' in navigator) {
      navigator.vibrate(10)
    }
    this.months.invalidate(monthOf(saved.date))
    this.savedToast = this.toasts.show({
      messageKey: TOAST_KEYS.saved,
      action: { labelKey: TOAST_KEYS.undo, run: () => void this.undo(saved) },
    })
    this.clearDraft()
  }

  /** Clears what changes from one entry to the next; type, accounts, payer and date stay. */
  private clearDraft(): void {
    this.entry.update((entry) => ({
      ...entry,
      amountCents: 0,
      categoryId: null,
      payee: '',
      description: '',
      isPrivate: false,
      tags: [],
    }))
    this.transfer.update((transfer) => ({ ...transfer, amountCents: 0, memo: '' }))
  }

  /** "Undo" on the toast: deletes what was just saved. */
  async undo(saved: Saved): Promise<void> {
    try {
      if (saved.kind === 'transfer') {
        await this.api.removeTransfer(saved.id)
        this.recent.update((rows) => rows.filter((row) => row.transferId !== saved.id))
      } else {
        await this.api.remove(saved.id)
        this.recent.update((rows) => rows.filter((row) => row.id !== saved.id))
      }
      this.months.invalidate(monthOf(saved.date))
      this.toasts.show({ messageKey: TOAST_KEYS.undone })
    } catch (error) {
      const message = failureMessage(toApiError(error))
      this.toasts.show({ messageKey: message.key, params: message.params, status: 'critical' })
    }
  }
}
