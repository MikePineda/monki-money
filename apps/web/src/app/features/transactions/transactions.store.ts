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
  type PayerFilter,
  type TransactionFilters,
} from '../../domain/transaction-filters'
import { groupByDay, recentPayees } from '../../domain/transaction-list'
import {
  TransactionsApi,
  type BulkResult,
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
  /** Both legs carry them; a transfer into savings for a tag counts as set aside. */
  tags: string[]
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
  /** A tag filter shows every month until a month is picked (a trip spans several). */
  private readonly allMonths = signal(false)

  readonly filters = computed<TransactionFilters>(() => {
    const narrow = this.narrow()
    const everyMonth = this.allMonths() && narrow.tag !== null
    return { ...narrow, month: everyMonth ? null : this.months.selectedMonth() }
  })
  readonly hasNarrowingFilters = computed(() => hasNarrowingFilters(this.filters()))
  readonly currentMonth = this.months.current

  setMonth(month: YearMonth): void {
    this.allMonths.set(false)
    this.months.selectedMonth.set(month)
  }

  /** Every month at once (offered while a tag filter is set). */
  showAllMonths(): void {
    this.allMonths.set(true)
  }

  /** Only rows carrying this tag, over every month; null drops the filter. */
  setTag(tag: string | null): void {
    this.allMonths.set(tag !== null)
    this.patchNarrow({ tag })
  }

  setAccount(accountId: number | null): void {
    this.patchNarrow({ accountId })
  }

  /** A member's rows, the joint ones (`'joint'`), or everyone's (null). */
  setPaidBy(paidBy: PayerFilter | null): void {
    this.patchNarrow({ paidBy })
  }

  setCategory(category: CategoryFilter | null): void {
    this.patchNarrow({ category })
  }

  setSearch(q: string): void {
    this.patchNarrow({ q })
  }

  clearFilters(): void {
    this.allMonths.set(false)
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
    params: () => {
      const filters = this.filters()
      return {
        filters,
        pages: this.pages(),
        // A list over every month reloads after a change in any of them.
        revision:
          filters.month === null
            ? this.months.ledgerRevision()
            : this.months.revisionOf(filters.month),
      }
    },
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
  /** The next page is on its way ("load more"); the rows on screen stay as they are. */
  readonly loadingMore = computed(
    () => this.list.isLoading() && this.pages() > (this.shown()?.pages ?? Infinity)
  )
  /** A reload (filters, a change elsewhere): the previous rows stay, dimmed. */
  readonly refreshing = computed(
    () => this.shown() !== undefined && this.list.isLoading() && !this.loadingMore()
  )
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

  /**
   * Both sides of a transfer: from the loaded legs when the list has both,
   * else in one call (`GET /transfers/:id`, both legs and the memo).
   */
  async transferOf(leg: Transaction): Promise<TransferDetails> {
    const transferId = leg.transferId as number
    const listed = this.rows().filter((row) => row.transferId === transferId)
    if (listed.length < 2) {
      const transfer = await this.transfersApi.show(transferId)
      return {
        transferId,
        date: transfer.date,
        amountCents: transfer.amountCents,
        fromAccountId: transfer.fromAccountId,
        toAccountId: transfer.toAccountId,
        memo: transfer.memo,
        tags: [...leg.tags],
      }
    }
    const outgoing = listed.find((row) => row.amountCents < 0) ?? leg
    const incoming = listed.find((row) => row.amountCents > 0) ?? null
    return {
      transferId,
      date: leg.date,
      amountCents: Math.abs(leg.amountCents),
      fromAccountId: outgoing.accountId,
      toAccountId: incoming?.accountId ?? null,
      memo: leg.description,
      tags: [...leg.tags],
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

  /**
   * Adds and removes tags on the selected rows (a transfer changes both
   * legs) and says how many changed; null when the API refused it (the
   * toast says why). The months of the rows reload.
   */
  async bulkTags(
    rows: readonly Transaction[],
    changes: { add: readonly string[]; remove: readonly string[] }
  ): Promise<BulkResult | null> {
    return this.bulk(rows, () => this.api.bulkTags(ids(rows), changes), {
      /** t(transactions.toast.bulkTagged) */
      messageKey: 'transactions.toast.bulkTagged',
    })
  }

  /**
   * One category (null = none) on the selected rows; transfers, split rows
   * and the partner's private ones are left as they were.
   */
  async bulkCategorize(
    rows: readonly Transaction[],
    categoryId: number | null
  ): Promise<BulkResult | null> {
    return this.bulk(rows, () => this.api.bulkCategorize(ids(rows), categoryId), {
      /** t(transactions.toast.bulkCategorized) */
      messageKey: 'transactions.toast.bulkCategorized',
    })
  }

  /* ------------------------------------------------------------ internals */

  private blankNarrow(): NarrowFilters {
    const { accountId, paidBy, category, q, tag } = initialFilters(this.months.current())
    return { accountId, paidBy, category, q, tag }
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

  private async bulk(
    rows: readonly Transaction[],
    change: () => Promise<BulkResult>,
    toast: { messageKey: string }
  ): Promise<BulkResult | null> {
    try {
      const result = await change()
      this.invalidate(...rows.map((row) => row.date))
      this.toasts.show({
        messageKey: toast.messageKey,
        params: { updated: result.updated, skipped: result.skipped },
        status: result.updated > 0 ? 'good' : 'warning',
      })
      return result
    } catch (error) {
      this.fail(error)
      return null
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
      tags: [...details.tags],
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
    if (failure.kind === 'http' && failure.code === 'E_PAYSLIP_LINE') {
      /** t(transactions.toast.payslipLine) */
      this.toasts.show({ messageKey: 'transactions.toast.payslipLine', status: 'critical' })
      return
    }
    const message = failureMessage(failure)
    this.toasts.show({ messageKey: message.key, params: message.params, status: 'critical' })
  }
}

function ids(rows: readonly Transaction[]): number[] {
  return [...new Set(rows.map((row) => row.id))]
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
