import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core'
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
  suggestionFingerprint,
  summary,
  type ReviewFilter,
  type RowChange,
  type RowChangeRequest,
} from '../../domain/import-row'
import { monthOf, monthRange } from '../../domain/month'
import { ImportResults } from './data-access/import-results'
import { ImportsApi, type ConfirmResult } from './data-access/imports.api'

/** How often a running classification is polled (`GET /imports/:id`). */
export const CLASSIFY_POLL_MS = 2_000
/** Polls before giving up on a classification that keeps changing (2 minutes). */
export const CLASSIFY_MAX_POLLS = 60
/** Row decisions sent at once by a bulk action (the API serialises them per batch). */
export const BULK_CONCURRENCY = 4

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
 * and a refusal rolls it back with a toast. Bulk actions send their
 * decisions a few at a time. "Classify with AI" starts the model and polls
 * the batch every {@link CLASSIFY_POLL_MS} until the suggestions settle.
 * Confirm sends `decisionsFor(rows)`, remembers the result for the result
 * screen and invalidates the months the file covers. Provided by the page.
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
      this.take(await this.api.show(id, controller.signal))
      this.status.set('ready')
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

  /**
   * Bulk decisions, {@link BULK_CONCURRENCY} at a time. Resolves with how
   * many the API accepted; the selection clears once they are all in.
   */
  async applyMany(requests: readonly RowChangeRequest[]): Promise<number> {
    if (requests.length === 0 || this.bulkBusy()) {
      return 0
    }
    this.bulkBusy.set(true)
    let accepted = 0
    try {
      const queue = [...requests]
      const worker = async () => {
        for (let next = queue.shift(); next; next = queue.shift()) {
          if (await this.decide(next.rowId, next.change)) {
            accepted += 1
          }
        }
      }
      await Promise.all(Array.from({ length: BULK_CONCURRENCY }, worker))
    } finally {
      this.bulkBusy.set(false)
    }
    this.selection.set(new Set())
    // When none went through, the refusal's own toast stays on screen.
    if (accepted > 0) {
      /** t(import.toast.bulkDone) */
      this.toasts.show({
        messageKey: 'import.toast.bulkDone',
        params: { count: accepted },
        status: 'good',
      })
    }
    return accepted
  }

  clearSelection(): void {
    this.selection.set(new Set())
  }

  /* ------------------------------------------------------- classification */

  /**
   * Asks the model for categories, then polls the batch until the rows'
   * suggestions stop changing (the API does not say when a run ends).
   * A run already going (409) is followed the same way.
   */
  async classify(): Promise<void> {
    const id = this.batchId
    if (id === null || this.classifying()) {
      return
    }
    this.classifying.set(true)
    try {
      try {
        await this.api.classify(id)
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
      await this.pollClassification(id)
    } finally {
      this.classifying.set(false)
    }
  }

  private async pollClassification(id: number): Promise<void> {
    let previous = suggestionFingerprint(this.rows())
    let seenChange = false
    for (let attempt = 0; attempt < CLASSIFY_MAX_POLLS && !this.destroyed; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, CLASSIFY_POLL_MS))
        if (this.destroyed) {
          return
        }
      }
      let detail: ImportBatchDetail
      try {
        detail = await this.api.show(id)
      } catch (error) {
        this.fail(error)
        return
      }
      this.take(detail, true)
      const current = suggestionFingerprint(this.rows())
      const changed = current !== previous
      seenChange ||= changed
      // The model answered every row it could take, or two polls agree.
      const untouched = classifiableRows(this.rows()).filter(
        (row) => row.suggestion?.source !== 'llm'
      )
      if ((seenChange && untouched.length === 0) || (attempt > 0 && !changed)) {
        break
      }
      previous = current
    }
    if (!this.destroyed) {
      /** t(import.toast.classified) */
      this.toasts.show({ messageKey: 'import.toast.classified', status: 'good' })
    }
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

  private replaceRow(next: ImportRow): void {
    this.rows.update((rows) => rows.map((row) => (row.id === next.id ? next : row)))
  }

  private markPending(rowId: number, on: boolean): void {
    this.pending.update((current) => {
      const next = new Set(current)
      if (on) {
        next.add(rowId)
      } else {
        next.delete(rowId)
      }
      return next
    })
  }

  /** Every month the file's dates cover (its rows may land anywhere in between). */
  private invalidateMonths(): void {
    const batch = this.batch()
    const dates = this.rows().map((row) => row.date)
    const from = [batch?.dateFrom, ...dates].filter((date): date is string => !!date).sort()[0]
    const to = [batch?.dateTo, ...dates]
      .filter((date): date is string => !!date)
      .sort()
      .at(-1)
    if (!from || !to) {
      return
    }
    for (const month of monthRange(monthOf(from), monthOf(to))) {
      this.months.invalidate(month)
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
