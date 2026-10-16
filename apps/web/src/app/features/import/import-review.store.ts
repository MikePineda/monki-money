import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core'
import { MAX_BULK_ROW_CHANGES } from '@monkimoney/shared'
import type { ImportBatch, ImportBatchDetail, ImportRow } from '../../core/api/api-types'
import { failureMessage, type Message } from '../../core/api/error-messages'
import { errorPayload, hasStatus, toApiError } from '../../core/api/http-errors'
import { HouseholdDirectory } from '../../core/household/household-directory.store'
import { MonthStore } from '../../core/month/month.store'
import { ToastStore } from '../../core/ui/toast.store'
import {
  applyDecision,
  assignCategoryChanges,
  blockingRowIds,
  bulkAcceptSuggested,
  classifiableRows,
  decisionsFor,
  filterRows,
  ignoreChanges,
  restoreChanges,
  summary,
  undoChanges,
  type ReviewFilter,
  type RowChange,
  type RowChangeRequest,
} from '../../domain/import-row'
import { monthOf, monthRange } from '../../domain/month'
import { ImportResults } from './data-access/import-results'
import { ImportsApi, type ConfirmResult } from './data-access/imports.api'

/** How often a running classification is polled (`GET /imports/:id?rows=0`). */
export const CLASSIFY_POLL_MS = 2_000
/**
 * Polls before the screen stops following a run that never says it ended
 * (10 minutes: the API stops counting a claim that old as a live run).
 */
export const CLASSIFY_MAX_POLLS = 300

/** A row as a save left it: a later decision on it changes one of these. */
function sameState(a: ImportRow | undefined, b: ImportRow | undefined): boolean {
  return (
    !!a &&
    !!b &&
    a.resolution === b.resolution &&
    a.decidedAt === b.decidedAt &&
    JSON.stringify(a.decision) === JSON.stringify(b.decision)
  )
}

export type ReviewStatus = 'loading' | 'ready' | 'error'

/** The batch without its rows (the rows live in their own signal). */
function withoutRows(detail: ImportBatchDetail | ImportBatch): ImportBatch {
  const batch: Partial<ImportBatchDetail> = { ...detail }
  delete batch.rows
  return batch as ImportBatch
}

/**
 * State of the review screen `/import/:id`: the batch, its rows, the filter
 * and the selection, and every decision.
 *
 * Decisions are optimistic: the row shows the outcome at once
 * (`applyDecision`), the `PATCH` goes out, the row takes the API's answer,
 * and a refusal rolls it back with a toast. Bulk actions (accept, assign a
 * category, ignore, restore) go out as one all-or-nothing request
 * (`PATCH /imports/:id/rows`) and their toast offers "Undo", which puts
 * the rows back as they were in one more. The rows load once; "Classify
 * with AI" (or a run already going when the screen opens) polls the batch
 * alone every {@link CLASSIFY_POLL_MS} while it says `classifying`, then
 * reloads the rows once. Confirm sends `decisionsFor(rows)`, remembers the
 * result for the result screen and invalidates the months the file covers.
 * Provided by the page.
 */
@Injectable()
export class ImportReviewStore {
  private readonly api = inject(ImportsApi)
  private readonly months = inject(MonthStore)
  private readonly toasts = inject(ToastStore)
  private readonly results = inject(ImportResults)
  readonly directory = inject(HouseholdDirectory)

  private batchId: number | null = null
  private destroyed = false
  private loadController: AbortController | null = null

  readonly batch = signal<ImportBatch | null>(null)
  readonly rows = signal<ImportRow[]>([])
  readonly status = signal<ReviewStatus>('loading')
  readonly loadFailure = signal<Message | null>(null)
  readonly filter = signal<ReviewFilter>('all')
  readonly selection = signal<ReadonlySet<string | number>>(new Set())
  /** Rows with a decision on its way (their checkbox and actions wait). */
  readonly pending = signal<ReadonlySet<number>>(new Set())
  readonly bulkBusy = signal(false)
  /** The screen follows a classify run (started here, elsewhere or before a reload). */
  readonly classifying = signal(false)
  readonly confirming = signal(false)
  readonly cancelling = signal(false)

  readonly isStaged = computed(() => this.batch()?.status === 'staged')
  readonly summary = computed(() => summary(this.rows(), this.batch()?.counts.duplicate ?? 0))
  readonly visibleRows = computed(() => filterRows(this.rows(), this.filter()))
  readonly selectedRows = computed(() => {
    const selection = this.selection()
    return this.rows().filter((row) => selection.has(row.id))
  })
  readonly blocking = computed(() => blockingRowIds(this.rows()))
  readonly classifiable = computed(() => classifiableRows(this.rows()).length)
  readonly canConfirm = computed(
    () =>
      this.status() === 'ready' &&
      this.isStaged() &&
      this.blocking().length === 0 &&
      this.pending().size === 0 &&
      !this.bulkBusy() &&
      !this.confirming() &&
      !this.cancelling()
  )

  constructor() {
    void this.directory.load().catch(() => undefined)
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true
      this.loadController?.abort()
    })
  }

  /* ---------------------------------------------------------------- load */

  async load(id: number): Promise<void> {
    this.batchId = id
    this.loadController?.abort()
    const controller = new AbortController()
    this.loadController = controller
    this.status.set(this.batch() ? 'ready' : 'loading')
    this.loadFailure.set(null)
    try {
      const detail = await this.api.show(id, controller.signal)
      this.take(detail)
      this.status.set('ready')
      if (detail.classifying) {
        void this.followClassification(id)
      }
    } catch (error) {
      if (controller.signal.aborted) {
        return
      }
      this.loadFailure.set(failureMessage(toApiError(error)))
      this.status.set('error')
    }
  }

  retry(): void {
    if (this.batchId !== null) {
      void this.load(this.batchId)
    }
  }

  /* ----------------------------------------------------------- decisions */

  /**
   * One row's decision: shown at once, then saved. Resolves true once the
   * API accepted it; a refusal puts the row back as it was and says why.
   */
  async decide(rowId: number, change: RowChange): Promise<boolean> {
    const id = this.batchId
    const before = this.rows().find((row) => row.id === rowId)
    if (id === null || !before) {
      return false
    }
    this.replaceRow(applyDecision(before, change, new Date().toISOString()))
    this.markPending(rowId, true)
    try {
      this.replaceRow(await this.api.decide(id, rowId, change))
      return true
    } catch (error) {
      this.replaceRow(before)
      this.fail(error)
      return false
    } finally {
      this.markPending(rowId, false)
    }
  }

  /** "Accept suggested": the selected rows when there are any, else every row. */
  acceptSuggested(): Promise<number> {
    const scope = this.selection().size > 0 ? this.selectedRows() : this.rows()
    return this.applyMany(bulkAcceptSuggested(scope))
  }

  /** "Assign category" for the selected rows. */
  assignCategory(categoryId: number): Promise<number> {
    return this.applyMany(assignCategoryChanges(this.selectedRows(), categoryId))
  }

  /** "Ignore" for the selected rows. */
  ignoreSelected(): Promise<number> {
    return this.applyMany(ignoreChanges(this.selectedRows()))
  }

  /** "Restore" for the selected ignored rows. */
  restoreSelected(): Promise<number> {
    return this.applyMany(restoreChanges(this.selectedRows()))
  }

  /**
   * A bulk action: every row shows its outcome at once, then one request
   * saves them all or none (one per {@link MAX_BULK_ROW_CHANGES} rows).
   * Resolves with how many rows changed (0 when refused: the rows go back
   * and the refusal is said). The selection clears once saved and the toast
   * offers "Undo".
   */
  async applyMany(requests: readonly RowChangeRequest[]): Promise<number> {
    const id = this.batchId
    if (id === null || requests.length === 0 || this.bulkBusy()) {
      return 0
    }
    const changes = new Map(requests.map((request) => [request.rowId, request.change]))
    const before = this.rows().filter((row) => changes.has(row.id))
    const decidedAt = new Date().toISOString()
    const { saved, refused } = await this.saveMany(
      id,
      before.map((row) => applyDecision(row, changes.get(row.id) ?? {}, decidedAt)),
      before,
      requests.map(({ rowId, change }) => ({ rowId, ...change }))
    )
    if (saved.length === 0) {
      return 0
    }
    this.selection.set(new Set())
    if (refused) {
      // Part went through: the refusal stays on screen, the saved rows show what they became.
      return saved.length
    }
    const savedIds = new Set(saved.map((row) => row.id))
    const undoable = before.filter((row) => savedIds.has(row.id))
    /** t(import.toast.bulkDone, import.toast.undo) */
    this.toasts.show({
      messageKey: 'import.toast.bulkDone',
      params: { count: saved.length },
      status: 'good',
      action: { labelKey: 'import.toast.undo', run: () => void this.undo(undoable, saved) },
    })
    return saved.length
  }

  /**
   * "Undo" of a bulk action: `before` (the rows as they were) shows at
   * once and one request puts them back on the API (a reset to the
   * importer's proposal plus the decision each row had). Only rows still
   * as the action saved them (`saved`) go back: a decision taken since on
   * one of them stays. A refusal keeps what the bulk action did and says
   * why.
   */
  async undo(before: readonly ImportRow[], saved: readonly ImportRow[]): Promise<boolean> {
    const id = this.batchId
    const savedById = new Map(saved.map((row) => [row.id, row]))
    const currentById = new Map(this.rows().map((row) => [row.id, row]))
    const untouched = before.filter((row) =>
      sameState(currentById.get(row.id), savedById.get(row.id))
    )
    if (id === null || untouched.length === 0 || this.bulkBusy()) {
      return false
    }
    const current = untouched.map((row) => currentById.get(row.id) as ImportRow)
    const { refused } = await this.saveMany(id, untouched, current, undoChanges(untouched))
    if (refused) {
      return false
    }
    /** t(import.toast.undone) */
    this.toasts.show({ messageKey: 'import.toast.undone' })
    return true
  }

  clearSelection(): void {
    this.selection.set(new Set())
  }

  /* ------------------------------------------------------- classification */

  /**
   * Asks the model for categories and follows the run: the answer says
   * whether it still goes on (`classifying`; with the sync queue it already
   * ended). A run already going (409) is followed the same way.
   */
  async classify(): Promise<void> {
    const id = this.batchId
    if (id === null || this.classifying()) {
      return
    }
    this.classifying.set(true)
    try {
      let running = true
      try {
        const batch = await this.api.classify(id)
        this.batch.set(withoutRows(batch))
        running = batch.classifying
      } catch (error) {
        const apiError = toApiError(error)
        if (
          !hasStatus(apiError, 409) ||
          errorPayload(error)['code'] !== 'E_IMPORT_CLASSIFY_RUNNING'
        ) {
          this.fail(error)
          return
        }
        /** t(import.toast.classifyRunning) */
        this.toasts.show({ messageKey: 'import.toast.classifyRunning' })
      }
      await this.awaitClassification(id, running)
    } finally {
      this.classifying.set(false)
    }
  }

  /** Follows a run the batch says is going on (found when the screen loads). */
  private async followClassification(id: number): Promise<void> {
    if (this.classifying()) {
      return
    }
    this.classifying.set(true)
    try {
      await this.awaitClassification(id, true)
    } finally {
      this.classifying.set(false)
    }
  }

  /**
   * While the run lasts, polls the batch alone (`?rows=0`) every
   * {@link CLASSIFY_POLL_MS}, at most {@link CLASSIFY_MAX_POLLS} times;
   * then reloads the rows once (rows with a decision on its way keep their
   * local state) and, when the run said it ended, that the suggestions are
   * in.
   */
  private async awaitClassification(id: number, running: boolean): Promise<void> {
    for (let attempt = 0; running && attempt < CLASSIFY_MAX_POLLS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, CLASSIFY_POLL_MS))
      if (this.destroyed) {
        return
      }
      try {
        const batch = await this.api.batch(id)
        this.batch.set(batch)
        running = batch.classifying
      } catch (error) {
        this.fail(error)
        return
      }
    }
    if (this.destroyed) {
      return
    }
    try {
      this.take(await this.api.show(id), true)
    } catch (error) {
      this.fail(error)
      return
    }
    if (running) {
      // Gave up following: the run may still be going, nothing to announce.
      return
    }
    /** t(import.toast.classified) */
    this.toasts.show({ messageKey: 'import.toast.classified', status: 'good' })
  }

  /* --------------------------------------------------- confirm and cancel */

  /** Confirms the batch; resolves with the result, or null (and a message) when refused. */
  async confirm(): Promise<ConfirmResult | null> {
    const id = this.batchId
    if (id === null || !this.canConfirm()) {
      return null
    }
    this.confirming.set(true)
    try {
      const result = await this.api.confirm(id, decisionsFor(this.rows()))
      const batch = this.batch()
      if (batch) {
        this.results.remember(result, { ...batch, status: 'completed' })
      }
      this.invalidateMonths()
      return result
    } catch (error) {
      const code = errorPayload(error)['code']
      if (code === 'E_IMPORT_ROWS_UNDECIDED') {
        // Someone else changed the batch meanwhile: show only the rows confirm waits for.
        await this.load(id)
        this.filter.set('blocking')
        /** t(import.toast.undecided) */
        this.toasts.show({ messageKey: 'import.toast.undecided', status: 'warning' })
      } else {
        this.fail(error)
      }
      return null
    } finally {
      this.confirming.set(false)
    }
  }

  /** Drops the rows still waiting; resolves true once the batch is cancelled. */
  async cancel(): Promise<boolean> {
    const id = this.batchId
    if (id === null || this.cancelling()) {
      return false
    }
    this.cancelling.set(true)
    try {
      this.batch.set(withoutRows(await this.api.cancel(id)))
      /** t(import.toast.cancelled) */
      this.toasts.show({ messageKey: 'import.toast.cancelled' })
      return true
    } catch (error) {
      this.fail(error)
      return false
    } finally {
      this.cancelling.set(false)
    }
  }

  /* ------------------------------------------------------------ internals */

  /**
   * Takes a fresh copy of the batch. While polling, rows with a decision
   * on its way keep their local (optimistic) state.
   */
  private take(detail: ImportBatchDetail, keepPending = false): void {
    this.batch.set(withoutRows(detail))
    const pending = this.pending()
    const local = new Map(this.rows().map((row) => [row.id, row]))
    this.rows.set(
      detail.rows.map((row) =>
        keepPending && pending.has(row.id) ? (local.get(row.id) ?? row) : row
      )
    )
    const ids = new Set(detail.rows.map((row) => row.id))
    this.selection.update((current) => new Set([...current].filter((key) => ids.has(Number(key)))))
  }

  /**
   * Shows `preview` at once, sends `changes` (one request per
   * {@link MAX_BULK_ROW_CHANGES}, each all or nothing) and takes the rows
   * they answer; a refusal puts `fallback` back for the rows not saved yet
   * and says why. Resolves with the saved rows and whether a request was
   * refused.
   */
  private async saveMany(
    id: number,
    preview: readonly ImportRow[],
    fallback: readonly ImportRow[],
    changes: Parameters<ImportsApi['decideMany']>[1]
  ): Promise<{ saved: ImportRow[]; refused: boolean }> {
    const ids = preview.map((row) => row.id)
    const saved: ImportRow[] = []
    this.bulkBusy.set(true)
    this.replaceRows(preview)
    this.markPending(ids, true)
    try {
      for (let offset = 0; offset < changes.length; offset += MAX_BULK_ROW_CHANGES) {
        const answered = await this.api.decideMany(
          id,
          changes.slice(offset, offset + MAX_BULK_ROW_CHANGES)
        )
        this.replaceRows(answered)
        saved.push(...answered)
      }
      return { saved, refused: false }
    } catch (error) {
      const done = new Set(saved.map((row) => row.id))
      this.replaceRows(fallback.filter((row) => !done.has(row.id)))
      this.fail(error)
      return { saved, refused: true }
    } finally {
      this.markPending(ids, false)
      this.bulkBusy.set(false)
    }
  }

  private replaceRow(next: ImportRow): void {
    this.replaceRows([next])
  }

  private replaceRows(next: readonly ImportRow[]): void {
    const byId = new Map(next.map((row) => [row.id, row]))
    this.rows.update((rows) => rows.map((row) => byId.get(row.id) ?? row))
  }

  private markPending(rowIds: number | readonly number[], on: boolean): void {
    this.pending.update((current) => {
      const next = new Set(current)
      for (const rowId of typeof rowIds === 'number' ? [rowIds] : rowIds) {
        if (on) {
          next.add(rowId)
        } else {
          next.delete(rowId)
        }
      }
      return next
    })
  }

  /**
   * Every month the file's dates cover (its rows may land anywhere in
   * between), and the current month: confirming runs recurring payment
   * detection, which changes what the current month counts as committed
   * even when the file is about older months.
   */
  private invalidateMonths(): void {
    const current = this.months.current()
    const batch = this.batch()
    const dates = this.rows().map((row) => row.date)
    const from = [batch?.dateFrom, ...dates].filter((date): date is string => !!date).sort()[0]
    const to = [batch?.dateTo, ...dates]
      .filter((date): date is string => !!date)
      .sort()
      .at(-1)
    const covered = from && to ? monthRange(monthOf(from), monthOf(to)) : []
    for (const month of covered) {
      this.months.invalidate(month)
    }
    if (!covered.includes(current)) {
      this.months.invalidate(current)
    }
  }

  private fail(error: unknown): void {
    const apiError = toApiError(error)
    if (apiError.kind === 'unauthorized') {
      return
    }
    const payload = errorPayload(error)
    if (payload['code'] === 'E_IMPORT_BATCH_CLOSED') {
      /** t(import.toast.closed) */
      this.toasts.show({ messageKey: 'import.toast.closed', status: 'warning' })
      this.retry()
      return
    }
    if (payload['code'] === 'E_LLM_QUOTA_EXCEEDED') {
      /** t(import.toast.quota) */
      this.toasts.show({ messageKey: 'import.toast.quota', status: 'warning' })
      return
    }
    if (apiError.kind === 'validation') {
      const message = Object.values(apiError.fields)[0]
      if (message) {
        /** t(import.toast.refused) */
        this.toasts.show({
          messageKey: 'import.toast.refused',
          params: { reason: message },
          status: 'critical',
        })
        return
      }
    }
    const message = failureMessage(apiError)
    this.toasts.show({ messageKey: message.key, params: message.params, status: 'critical' })
  }
}
