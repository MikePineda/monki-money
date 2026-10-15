import {
  Injectable,
  computed,
  inject,
  linkedSignal,
  resource,
  signal,
  untracked,
} from '@angular/core'
import type { Transaction } from '../../core/api/api-types'
import { failureMessage } from '../../core/api/error-messages'
import { toApiError } from '../../core/api/http-errors'
import { AccountsApi } from '../../core/household/accounts.api'
import { CategoriesStore } from '../../core/household/categories.store'
import { MembersStore } from '../../core/household/members.store'
import { MonthStore } from '../../core/month/month.store'
import { HOUSEHOLD_TIME_ZONE } from '../../core/platform/time-zone.token'
import { ToastStore } from '../../core/ui/toast.store'
import { monthOf, todayIn, type YearMonth } from '../../domain/month'
import { toSplitPayload, type SplitDraftLine } from '../../domain/split'
import {
  hasNarrowingFilters,
  initialFilters,
  toListQuery,
  type CategoryFilter,
  type TransactionFilters,
} from '../../domain/transaction-filters'
import { groupByDay, recentPayees } from '../../domain/transaction-list'
import {
  TransactionsApi,
  type TransactionCreateInput,
  type TransactionPatch,
} from './data-access/transactions.api'
import { TransfersApi, type TransferInput } from './data-access/transfers.api'

/** What the list holds: every loaded page, flattened. */
interface ListState {
  rows: Transaction[]
  pages: number
  lastPage: number
  total: number
}

interface ListParams {
  filters: TransactionFilters
  pages: number
  revision: number
}

/** A transfer as both legs describe it. */
export interface TransferDetails {
  transferId: number
  date: string
  amountCents: number
  fromAccountId: number
  toAccountId: number | null
  memo: string | null
}

type NarrowFilters = Omit<TransactionFilters, 'month'>

/**
 * State of the transactions screen: the filters (the month is shared with
 * the Month view through {@link MonthStore}), the list as a `resource()`
 * that grows page by page ("load more"), and every change to it.
 *
 * Changes are optimistic: the list shows the edit at once, rolls back if the
 * API refuses it, and on success invalidates the months it touched, which
 * reloads this list and any month summary that reads the same revision.
 * Provided by the list page, so the edit and split sheets share it.
 */
@Injectable()
export class TransactionsStore {
  private readonly api = inject(TransactionsApi)
  private readonly transfersApi = inject(TransfersApi)
  private readonly accountsApi = inject(AccountsApi)
  private readonly months = inject(MonthStore)
  private readonly toasts = inject(ToastStore)
  private readonly timeZone = inject(HOUSEHOLD_TIME_ZONE)
  readonly categories = inject(CategoriesStore)
  readonly members = inject(MembersStore)

  /* ------------------------------------------------------------- filters */

  private readonly narrow = signal<NarrowFilters>(this.blankNarrow())

  readonly filters = computed<TransactionFilters>(() => ({
    ...this.narrow(),
    month: this.months.selectedMonth(),
  }))
  readonly hasNarrowingFilters = computed(() => hasNarrowingFilters(this.filters()))
  readonly currentMonth = this.months.current

  setMonth(month: YearMonth): void {
    this.months.selectedMonth.set(month)
  }

  setAccount(accountId: number | null): void {
    this.patchNarrow({ accountId })
  }

  setPaidBy(paidByUserId: number | null): void {
    this.patchNarrow({ paidByUserId })
  }

  setCategory(category: CategoryFilter | null): void {
    this.patchNarrow({ category })
  }

  setSearch(q: string): void {
    this.patchNarrow({ q })
  }

  clearFilters(): void {
    this.patchNarrow(this.blankNarrow())
  }

  /** Applies filter changes; the same values again leave the list alone (no reload). */
  private patchNarrow(changes: Partial<NarrowFilters>): void {
    const current = this.narrow()
    const next = { ...current, ...changes }
    if (JSON.stringify(next) !== JSON.stringify(current)) {
      this.narrow.set(next)
    }
  }

  /* ---------------------------------------------------------------- data */

  readonly accounts = resource({ loader: () => this.accountsApi.list() })

  /** Pages to show; back to one whenever the query (not the revision) changes. */
  private readonly pages = linkedSignal({
    source: () => JSON.stringify(toListQuery(this.filters(), 1)),
    computation: () => 1,
  })

  private loaded: { key: string; state: ListState } | null = null

  readonly list = resource<ListState, ListParams>({
    params: () => ({
      filters: this.filters(),
      pages: this.pages(),
      revision: this.months.revisionOf(this.filters().month),
    }),
    loader: ({ params, abortSignal }) => this.loadPages(params, abortSignal),
  })

  /** The last list that loaded: kept on screen (dimmed) while the next one loads. */
  private readonly shown = linkedSignal<ListState | undefined, ListState | undefined>({
    source: () => (this.list.hasValue() ? this.list.value() : undefined),
    computation: (next, previous) => next ?? previous?.value,
  })

  readonly rows = computed(() => this.shown()?.rows ?? [])
  readonly days = computed(() => groupByDay(this.rows()))
  readonly firstLoad = computed(() => this.shown() === undefined && this.list.isLoading())
  readonly refreshing = computed(() => this.shown() !== undefined && this.list.isLoading())
  readonly failed = computed(() => this.list.status() === 'error')
  readonly hasMore = computed(() => {
    const state = this.shown()
    return state !== undefined && state.pages < state.lastPage
  })
  /** Payees seen in the loaded rows, most recent first (suggestions in the form). */
  readonly payeeHistory = computed(() =>
    recentPayees(
      this.rows().map((row) => row.payee),
      '',
      50
    )
  )

  constructor() {
    void this.categories.load().catch(() => undefined)
    void this.members.load().catch(() => undefined)
  }

  loadMore(): void {
    if (this.hasMore() && !this.list.isLoading()) {
      this.pages.update((count) => count + 1)
    }
  }

  retry(): void {
    this.list.reload()
  }

  /** A row from the list, or from the API when it is not loaded (deep link). */
  async find(id: number): Promise<Transaction> {
    return this.rows().find((row) => row.id === id) ?? (await this.api.show(id))
  }

  /** Both sides of a transfer, from the loaded legs or the API. */
  async transferOf(leg: Transaction): Promise<TransferDetails> {
    const transferId = leg.transferId as number
    let legs = this.rows().filter((row) => row.transferId === transferId)
    if (legs.length < 2) {
      legs = await this.api.transferLegs(transferId, leg.date)
    }
    const outgoing = legs.find((row) => row.amountCents < 0) ?? (leg.amountCents < 0 ? leg : null)
    const incoming = legs.find((row) => row.amountCents > 0) ?? (leg.amountCents > 0 ? leg : null)
    return {
      transferId,
      date: leg.date,
      amountCents: Math.abs(leg.amountCents),
      fromAccountId: outgoing?.accountId ?? leg.accountId,
      toAccountId: incoming?.accountId ?? null,
      memo: leg.description,
    }
  }

  /* ------------------------------------------------------------- changes */

  /** PATCH with an optimistic preview; rejects (after rolling back) with the API error. */
  async update(row: Transaction, patch: TransactionPatch): Promise<Transaction> {
    const before = this.snapshot()
    this.replaceLocal(row.id, previewPatch(row, patch))
    try {
      const saved = await this.api.update(row.id, patch)
      this.replaceLocal(row.id, saved)
      this.invalidate(row.date, saved.date)
      return saved
    } catch (error) {
      this.restore(before)
      throw error
    }
  }

  /** Replaces the split lines (the remainder fills the last one). */
  async saveSplits(row: Transaction, lines: readonly SplitDraftLine[]): Promise<Transaction> {
    const saved = await this.api.updateSplits(row.id, {
      splits: toSplitPayload(row.amountCents, lines),
    })
    this.replaceLocal(row.id, saved)
    this.invalidate(row.date)
    return saved
  }

  /** Back to a single category. */
  async unsplit(row: Transaction, categoryId: number | null): Promise<Transaction> {
    const saved = await this.api.updateSplits(row.id, { splits: [], categoryId })
    this.replaceLocal(row.id, saved)
    this.invalidate(row.date)
    return saved
  }

  /** Deletes (a transfer leg deletes its transfer) and offers "Undo", which recreates it. */
  async remove(row: Transaction): Promise<void> {
    const before = this.snapshot()
    const isTransfer = row.transferId !== null
    const removed = this.rows().filter((item) =>
      isTransfer ? item.transferId === row.transferId : item.id === row.id
    )
    this.removeLocal((item) => removed.includes(item))
    try {
      let undo: () => Promise<unknown>
      if (isTransfer) {
        const details = await this.transferOf(row)
        await this.transfersApi.remove(row.transferId as number)
        undo = () => this.recreateTransfer(details)
      } else {
        await this.api.remove(row.id)
        undo = () => this.api.create(this.recreateInput(row, row.date))
      }
      this.invalidate(row.date)
      this.toasts.show({
        /** t(transactions.toast.deleted, transactions.toast.transferDeleted, transactions.toast.undo) */
        messageKey: isTransfer
          ? 'transactions.toast.transferDeleted'
          : 'transactions.toast.deleted',
        action: {
          labelKey: 'transactions.toast.undo',
          run: () => void this.run(undo, row.date),
        },
      })
    } catch (error) {
      this.restore(before)
      this.fail(error)
    }
  }

  /** A copy dated today (or of the transfer, between the same accounts). */
  async duplicate(row: Transaction): Promise<void> {
    const today = todayIn(this.timeZone())
    await this.run(async () => {
      if (row.transferId !== null) {
        await this.recreateTransfer({ ...(await this.transferOf(row)), date: today })
      } else {
        await this.api.create(this.recreateInput(row, today))
      }
      /** t(transactions.toast.duplicated) */
      this.toasts.show({ messageKey: 'transactions.toast.duplicated', status: 'good' })
    }, today)
  }

  async updateTransfer(details: TransferDetails, input: Partial<TransferInput>): Promise<void> {
    await this.transfersApi.update(details.transferId, input)
    this.invalidate(details.date, input.date)
  }

  /* ------------------------------------------------------------ internals */

  private blankNarrow(): NarrowFilters {
    const { accountId, paidByUserId, category, q } = initialFilters(this.months.current())
    return { accountId, paidByUserId, category, q }
  }

  private async loadPages(params: ListParams, signal: AbortSignal): Promise<ListState> {
    const key = `${JSON.stringify(toListQuery(params.filters, 1))}#${params.revision}`
    const previous = this.loaded
    let state: ListState
    if (previous && previous.key === key && params.pages === previous.state.pages + 1) {
      const next = await this.api.list(toListQuery(params.filters, params.pages), signal)
      const base = untracked(() => (this.list.hasValue() ? this.list.value().rows : null))
      state = {
        rows: [...(base ?? previous.state.rows), ...next.rows],
        pages: params.pages,
        lastPage: next.lastPage,
        total: next.total,
      }
    } else {
      state = { rows: [], pages: 0, lastPage: 1, total: 0 }
      for (let number = 1; number <= params.pages; number++) {
        const next = await this.api.list(toListQuery(params.filters, number), signal)
        state = {
          rows: [...state.rows, ...next.rows],
          pages: number,
          lastPage: next.lastPage,
          total: next.total,
        }
        if (number >= next.lastPage) {
          break
        }
      }
    }
    this.loaded = { key, state }
    return state
  }

  private snapshot(): ListState | undefined {
    return this.list.hasValue() ? this.list.value() : undefined
  }

  private restore(state: ListState | undefined): void {
    if (state) {
      this.list.value.set(state)
    }
  }

  private replaceLocal(id: number, next: Transaction): void {
    if (!this.list.hasValue()) {
      return
    }
    this.list.value.update((state) => ({
      ...state,
      rows: state.rows.map((row) => (row.id === id ? next : row)),
    }))
  }

  private removeLocal(predicate: (row: Transaction) => boolean): void {
    if (!this.list.hasValue()) {
      return
    }
    this.list.value.update((state) => ({
      ...state,
      rows: state.rows.filter((row) => !predicate(row)),
    }))
  }

  private invalidate(...dates: (string | undefined)[]): void {
    const months = new Set(dates.filter((date): date is string => !!date).map(monthOf))
    for (const month of months) {
      this.months.invalidate(month)
    }
  }

  private async run(change: () => Promise<unknown>, date: string): Promise<void> {
    try {
      await change()
      this.invalidate(date)
    } catch (error) {
      this.fail(error)
    }
  }

  private recreateInput(row: Transaction, date: string): TransactionCreateInput {
    const kind = row.kind === 'income' ? 'income' : 'expense'
    const direction = row.amountCents < 0 ? -1 : 1
    return {
      clientId: crypto.randomUUID(),
      accountId: row.accountId,
      kind,
      date,
      amountCents: Math.abs(row.amountCents),
      ...(row.isSplit && row.splits.length >= 2
        ? {
            splits: row.splits.map((line) => ({
              categoryId: line.categoryId,
              amountCents: line.amountCents * direction,
              memo: line.memo,
            })),
          }
        : { categoryId: row.categoryId }),
      payee: row.payee,
      description: row.description,
      paidByUserId: row.paidByUserId,
      status: row.status,
      isPrivate: row.isPrivate,
      tags: [...row.tags],
    }
  }

  private recreateTransfer(details: TransferDetails) {
    if (details.toAccountId === null) {
      return Promise.reject(new Error('A transfer needs both accounts'))
    }
    return this.transfersApi.create({
      clientId: crypto.randomUUID(),
      fromAccountId: details.fromAccountId,
      toAccountId: details.toAccountId,
      date: details.date,
      amountCents: details.amountCents,
      memo: details.memo,
    })
  }

  private fail(error: unknown): void {
    const failure = toApiError(error)
    if (failure.kind === 'unauthorized') {
      return
    }
    if (failure.kind === 'forbidden' && failure.code === 'E_TRANSACTION_PRIVATE') {
      /** t(transactions.toast.private) */
      this.toasts.show({ messageKey: 'transactions.toast.private', status: 'critical' })
      return
    }
    const message = failureMessage(failure)
    this.toasts.show({ messageKey: message.key, params: message.params, status: 'critical' })
  }
}

/** The row as it will look once the PATCH lands (amounts typed positive, signed by kind). */
export function previewPatch(row: Transaction, patch: TransactionPatch): Transaction {
  const { amountCents, kind, ...rest } = patch
  const nextKind = kind ?? row.kind
  const magnitude = amountCents ?? Math.abs(row.amountCents)
  return {
    ...row,
    ...rest,
    kind: nextKind,
    amountCents: nextKind === 'expense' ? -magnitude : magnitude,
  } as Transaction
}
