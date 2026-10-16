import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core'
import type { TransactionSuggestions } from '@monkimoney/shared'
import { failureMessage } from '../../../core/api/error-messages'
import type { Transaction } from '../../../core/api/api-types'
import { toApiError } from '../../../core/api/http-errors'
import { SessionStore } from '../../../core/auth/session.store'
import {
  HouseholdDirectory,
  type CategoryEntry,
} from '../../../core/household/household-directory.store'
import { TransactionsApi } from '../../../core/ledger/transactions.api'
import { MonthStore } from '../../../core/month/month.store'
import { OutboxStore } from '../../../core/outbox/outbox.store'
import { newClientId } from '../../../core/platform/client-id'
import { LAST_ACCOUNT_KEY } from '../../../core/platform/last-account'
import { readPreference, writePreference } from '../../../core/platform/local-preference'
import { HOUSEHOLD_TIME_ZONE } from '../../../core/platform/time-zone.token'
import { WINDOW } from '../../../core/platform/window.token'
import { ToastStore } from '../../../core/ui/toast.store'
import { monthOf, todayIn, type IsoDate } from '../../../domain/month'
import {
  queuedAsRecent,
  type OutboxEntry,
  type OutboxItem,
  type TransactionPayload,
  type TransferPayload,
} from '../../../domain/outbox'
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
import {
  draftFromCreate,
  draftToCreate,
  transferFromCreate,
  transferToCreate,
  type TransactionDraft,
} from '../../../shared/transaction-form/transaction-draft'
import { EMPTY_DRAFT } from '../../../shared/transaction-form/transaction-form.component'
import {
  EMPTY_TRANSFER,
  transferDraftValid,
  type TransferDraft,
} from '../../../shared/transaction-form/transfer-form.component'
import { SuggestionsStore } from './suggestions.store'

export type QuickKind = 'expense' | 'income' | 'transfer'
export type LoadState = 'loading' | 'ready' | 'error'

/** Transfer routes offered as presets. */
const PRESET_COUNT = 3
/** Payees offered as suggestions (the form filters them by what is typed). */
const PAYEE_SUGGESTIONS = 20

const KINDS: readonly QuickKind[] = ['expense', 'income', 'transfer']

/**
 * Toasts are translated where they render. Declared for
 * transloco-keys-manager (scope keys): t(quickAdd.toast.saved, quickAdd.toast.undo, quickAdd.toast.undone)
 * t(quickAdd.toast.queued, quickAdd.toast.queuedMemory, quickAdd.toast.updated)
 * t(quickAdd.toast.undoSynced)
 */
const TOAST_KEYS = {
  saved: 'quickAdd.toast.saved',
  undo: 'quickAdd.toast.undo',
  undone: 'quickAdd.toast.undone',
  queued: 'quickAdd.toast.queued',
  queuedMemory: 'quickAdd.toast.queuedMemory',
  updated: 'quickAdd.toast.updated',
  undoSynced: 'quickAdd.toast.undoSynced',
} as const

/** What a tap on "Save" came to (the page leaves after an edit). */
export type SaveOutcome = 'saved' | 'queued' | 'edited' | 'kept'

/** A saved entry, enough to undo it. */
interface Saved {
  kind: QuickKind
  id: number
  date: IsoDate
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

/**
 * Quick add's state and behaviour (the sacred screen, 3 taps ≈ 6 s): the
 * drafts the shared transaction and transfer forms edit, the defaults they
 * open with, and saving. Provided by the page.
 *
 * - Defaults: expense (or the `type` the link asked for), the account this
 *   person used last on this device (`qa:account:<userId>`), else their
 *   latest entry, else the first active account; "you" paid; today in the
 *   household time zone; no category (saving without one is allowed).
 * - Saving sends a fresh client id. Offline (`navigator.onLine` false), or
 *   when the request fails for lack of network, a server error or a
 *   throttle, the entry goes to the offline outbox with that same client id
 *   (so a request that did land is never created twice) and syncs later:
 *   "Saved offline · will sync · Undo" (undo drops it from the outbox, or
 *   deletes the row once it synced), or "keep the app open" when the device
 *   could not store it. A 422 maps to field errors and queues nothing; any
 *   other refusal keeps the draft and says so in a toast.
 * - After a save: a haptic tick, "Saved · Undo" (undo deletes it), the
 *   draft clears, the outbox gets a chance to sync, and the screen stays on
 *   /add for the next one.
 * - The rankings (category tiles, payees, routes, the latest account) are
 *   the server's (`GET /transactions/suggestions`, over this person's and
 *   the household's latest rows) plus what waits in the outbox and what was
 *   saved since the screen opened, so an entry saved offline counts before
 *   it syncs.
 * - Offline it still opens with the accounts and categories already loaded
 *   this session and the last rankings it got (SuggestionsStore), or none.
 * - `/add?outbox=<id>` edits a queued entry: the drafts open with its
 *   values, the outbox holds it meanwhile, and saving replaces it (same
 *   client id) instead of posting.
 */
@Injectable()
export class QuickAddStore {
  private readonly api = inject(TransactionsApi)
  private readonly months = inject(MonthStore)
  private readonly toasts = inject(ToastStore)
  private readonly session = inject(SessionStore)
  private readonly window = inject(WINDOW)
  private readonly timeZone = inject(HOUSEHOLD_TIME_ZONE)
  private readonly outbox = inject(OutboxStore)
  private readonly suggestionsStore = inject(SuggestionsStore)
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
  /** 422 messages by API field (`amountCents`, `accountId`, `toAccountId`...). */
  readonly fieldErrors = signal<Record<string, string>>({})
  /** The queued entry being edited (`/add?outbox=<id>`), if any. */
  readonly editing = signal<string | null>(null)

  /** The server's rankings, as of when the screen opened. */
  private readonly suggestions = signal<TransactionSuggestions | null>(null)
  /** Rows saved since the screen opened (the server's rankings predate them). */
  private readonly recent = signal<RecentEntry[]>([])
  /** The "Saved · Undo" toast of the last save, while it may still be on screen. */
  private savedToast: number | null = null

  readonly today = computed(() => todayIn(this.timeZone()))
  readonly youId = computed(() => this.session.user()?.id ?? null)

  /** What the rankings add to the server's: queued entries (newest first), then rows saved here. */
  private readonly ranking = computed(() => [
    ...queuedAsRecent(this.outbox.entries(), this.youId()),
    ...this.recent(),
  ])

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
      this.ranking(),
      kind,
      this.today(),
      candidates.map((entry) => entry.category),
      QUICK_CATEGORY_COUNT,
      this.suggestions()?.categories[kind] ?? []
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
    transferPresets(
      this.ranking(),
      this.directory.accounts(),
      this.today(),
      PRESET_COUNT,
      this.suggestions()?.routes ?? []
    )
  )

  /** Recent payees of this kind, most used first (the form filters them as one types). */
  readonly payees = computed(() => {
    const kind = this.kind()
    return kind === 'transfer'
      ? []
      : payeeSuggestions(
          this.ranking(),
          kind,
          '',
          this.today(),
          PAYEE_SUGGESTIONS,
          this.suggestions()?.payees[kind] ?? []
        )
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

  constructor() {
    // Leaving an edit without saving lets the entry sync as it was.
    inject(DestroyRef).onDestroy(() => {
      const id = this.editing()
      if (id !== null) {
        void this.outbox.release(id)
      }
    })
  }

  /* ------------------------------------------------------------- loading */

  /**
   * Loads the household's accounts and categories and the server's
   * rankings, then applies the defaults, or the values of the queued entry
   * to edit.
   */
  async init(requestedKind: unknown, outboxId?: unknown): Promise<void> {
    if (isQuickKind(requestedKind)) {
      this.setKind(requestedKind)
    }
    this.loadState.set('loading')
    const loadedBefore = this.directory.status() === 'ready'
    try {
      const [, suggestions] = await Promise.all([
        this.directory.load(),
        // Rankings only order the defaults: offline, quick add opens with the cached ones or none.
        this.suggestionsStore.load(),
      ])
      this.suggestions.set(suggestions)
      this.applyDefaults()
      if (typeof outboxId === 'string') {
        this.edit(outboxId)
      }
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
            this.ranking(),
            this.directory.accounts(),
            this.storedAccount(youId),
            this.suggestions()?.lastAccountId ?? null
          )
    const pair = defaultTransferPair(this.directory.accounts(), this.presets(), accountId)
    const today = this.today()
    this.entry.update((entry) => ({ ...entry, accountId, paidByUserId: youId, date: today }))
    this.transfer.update((transfer) => ({ ...transfer, ...pair, date: today }))
  }

  /** Opens a queued entry for editing; one that is gone or syncing right now opens nothing. */
  private edit(id: string): void {
    const queued = this.outbox.entry(id)
    if (!queued || queued.status === 'syncing' || this.editing() !== null) {
      return
    }
    this.outbox.hold(id)
    this.editing.set(id)
    this.fill(queued)
  }

  private fill(queued: OutboxEntry): void {
    if (queued.kind === 'transfer') {
      this.setKind('transfer')
      this.transfer.set(transferFromCreate(queued.payload))
    } else {
      this.setKind(queued.payload.kind)
      this.entry.set(draftFromCreate(queued.payload))
    }
    // The keypad writes both drafts; keep them on the same amount.
    this.setAmount(queued.payload.amountCents)
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

  async save(): Promise<SaveOutcome> {
    if (!this.canSave()) {
      return 'kept'
    }
    const editing = this.editing()
    if (editing !== null) {
      return this.saveEdit(editing)
    }
    const item = this.draftItem(newClientId())
    if (this.window.navigator.onLine === false) {
      this.queue(item)
      return 'queued'
    }
    this.saving.set(true)
    this.fieldErrors.set({})
    try {
      const saved =
        item.kind === 'transfer'
          ? await this.saveTransfer(item.payload)
          : await this.saveEntry(item.payload)
      this.afterSave(saved)
      void this.outbox.flush()
      return 'saved'
    } catch (error) {
      return this.afterFailure(error, item)
    } finally {
      this.saving.set(false)
    }
  }

  /** The draft on screen as an outbox item (the API body plus its kind). */
  private draftItem(clientId: string): OutboxItem {
    return this.kind() === 'transfer'
      ? { kind: 'transfer', payload: transferToCreate(this.transfer(), clientId) }
      : { kind: 'transaction', payload: draftToCreate(this.entry(), clientId) }
  }

  private afterFailure(error: unknown, item: OutboxItem): SaveOutcome {
    const failure = toApiError(error)
    switch (failure.kind) {
      case 'validation':
        this.fieldErrors.set(failure.fields)
        return 'kept'
      case 'offline':
      case 'server':
      case 'throttled':
        // It may have landed anyway: the outbox retries with the same client id.
        this.queue(item)
        return 'queued'
      case 'unauthorized':
        // The session ended; the session store already sends the person to login.
        return 'kept'
      default: {
        const message = failureMessage(failure)
        this.toasts.show({ messageKey: message.key, params: message.params, status: 'critical' })
        return 'kept'
      }
    }
  }

  private async saveEntry(body: TransactionPayload): Promise<Saved> {
    const row = await this.api.quick(body)
    this.recent.update((rows) => [toRecentEntry(row), ...rows])
    this.rememberAccount(row.accountId)
    return { kind: body.kind, id: row.id, date: row.date }
  }

  private async saveTransfer(body: TransferPayload): Promise<Saved> {
    const saved = await this.api.transfer(body)
    this.recent.update((rows) => [...saved.legs.map(toRecentEntry), ...rows])
    return { kind: 'transfer', id: saved.id, date: saved.date }
  }

  /** The last account this person saved an expense or income with, on this device. */
  private rememberAccount(accountId: number): void {
    const youId = this.youId()
    if (youId !== null) {
      writePreference(this.window, `${LAST_ACCOUNT_KEY}${youId}`, String(accountId))
    }
  }

  /**
   * Into the outbox: on disk before the toast (or only in memory, which the
   * toast says), with "Undo", then the same "next entry" reset as a save.
   */
  private queue(item: OutboxItem): void {
    this.outbox.enqueue(item)
    if (item.kind === 'transaction') {
      this.rememberAccount(item.payload.accountId)
    }
    this.vibrate()
    const id = item.payload.clientId
    this.savedToast = this.toasts.show({
      messageKey: this.outbox.isPersisted() ? TOAST_KEYS.queued : TOAST_KEYS.queuedMemory,
      action: { labelKey: TOAST_KEYS.undo, run: () => void this.undoQueued(id) },
    })
    this.clearDraft()
  }

  /** "Undo" on "Saved offline": drops the queued entry, or deletes the row it became. */
  async undoQueued(id: string): Promise<void> {
    try {
      const outcome = await this.outbox.undo(id)
      this.toasts.show({
        messageKey: outcome === 'removed' ? TOAST_KEYS.undone : TOAST_KEYS.undoSynced,
      })
    } catch (error) {
      const message = failureMessage(toApiError(error))
      this.toasts.show({ messageKey: message.key, params: message.params, status: 'critical' })
    }
  }

  /** Saving an edited queued entry replaces it in the outbox (same client id). */
  private saveEdit(id: string): SaveOutcome {
    const item = this.draftItem(id)
    this.editing.set(null)
    void this.outbox.replace(id, item)
    this.vibrate()
    this.toasts.show({ messageKey: TOAST_KEYS.updated })
    return 'edited'
  }

  private vibrate(): void {
    const navigator = this.window.navigator
    if ('vibrate' in navigator) {
      navigator.vibrate(10)
    }
  }

  private afterSave(saved: Saved): void {
    this.vibrate()
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
