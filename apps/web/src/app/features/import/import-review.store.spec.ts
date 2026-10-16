import { TestBed } from '@angular/core/testing'
import { MAX_BULK_ROW_CHANGES } from '@monkimoney/shared'
import { TuyauHTTPError } from '@tuyau/core/client'
import {
  aDuplicateRow,
  aMatchCandidate,
  aTentativeSuggestion,
  aTrustedSuggestion,
  anImportBatch,
  anImportDetail,
  anImportRow,
} from '../../../testing/import-fixtures'
import { echoChange } from '../../../testing/import-testing'
import type { ImportRow } from '../../core/api/api-types'
import { SessionStore } from '../../core/auth/session.store'
import { HouseholdDirectory } from '../../core/household/household-directory.store'
import { MonthStore } from '../../core/month/month.store'
import { ToastStore } from '../../core/ui/toast.store'
import { ImportResults } from './data-access/import-results'
import { ImportsApi } from './data-access/imports.api'
import { CLASSIFY_MAX_POLLS, CLASSIFY_POLL_MS, ImportReviewStore } from './import-review.store'

function httpError(status: number, body: unknown) {
  const kyError = {
    response: { status, headers: new Headers() },
    request: { url: 'http://localhost/api/v1/imports/7', method: 'POST' },
    options: { prefixUrl: 'http://localhost' },
  }
  return new TuyauHTTPError(kyError as never, body)
}

const rows = (): ImportRow[] => [
  anImportRow({ id: 1, suggestion: aTrustedSuggestion(20) }),
  anImportRow({ id: 2, suggestion: aTentativeSuggestion(21) }),
  anImportRow({ id: 3, amountCents: -1450 }),
  anImportRow({ id: 4, resolution: 'auto_matched', match: aMatchCandidate(900) }),
  anImportRow({ id: 5, date: '2026-08-14', bankDate: '2026-08-14', resolution: 'ignored' }),
]

describe('ImportReviewStore', () => {
  let api: Record<
    'show' | 'batch' | 'decide' | 'decideMany' | 'classify' | 'confirm' | 'cancel',
    ReturnType<typeof vi.fn>
  >
  let months: { invalidate: ReturnType<typeof vi.fn>; current: () => string }

  async function setup(initial: ImportRow[] = rows(), batch = anImportBatch()) {
    api = {
      show: vi.fn(async () => ({ ...anImportDetail(initial), ...batch, rows: initial })),
      batch: vi.fn(async () => anImportBatch()),
      decide: vi.fn(async (_id: number, rowId: number, change: { categoryId?: number }) => {
        const row = initial.find((item) => item.id === rowId) as ImportRow
        return { ...row, decision: { ...change }, decidedAt: '2026-10-16T00:00:00.000Z' }
      }),
      decideMany: vi.fn(async (_id: number, changes: Record<string, unknown>[]) =>
        changes.map((change) => {
          const row = initial.find((item) => item.id === change['rowId']) as ImportRow
          return echoChange(row, change)
        })
      ),
      classify: vi.fn(async () => anImportBatch()),
      confirm: vi.fn(async () => ({
        batchId: 7,
        status: 'completed',
        created: 3,
        matched: 1,
        ignored: 1,
        transfers: 0,
        remaining: 0,
        reconciliation: anImportBatch().reconciliation,
      })),
      cancel: vi.fn(async () => anImportBatch({ status: 'cancelled' })),
    }
    months = { invalidate: vi.fn(), current: () => '2026-10' }
    TestBed.configureTestingModule({
      providers: [
        ImportReviewStore,
        { provide: ImportsApi, useValue: api },
        { provide: MonthStore, useValue: months },
        { provide: HouseholdDirectory, useValue: { load: vi.fn(async () => undefined) } },
        { provide: SessionStore, useValue: { onClear: () => undefined } },
      ],
    })
    const store = TestBed.inject(ImportReviewStore)
    await store.load(7)
    return store
  }

  afterEach(() => vi.useRealTimers())

  it('test_load_takes_the_batch_and_its_rows_in_file_order', async () => {
    const store = await setup()

    expect(api.show).toHaveBeenCalledWith(7, expect.any(AbortSignal))
    expect(store.status()).toBe('ready')
    expect(store.batch()?.id).toBe(7)
    expect(store.batch()).not.toHaveProperty('rows')
    expect(store.rows().map((row) => row.id)).toEqual([1, 2, 3, 4, 5])
  })

  it('test_a_failed_load_shows_a_retryable_error', async () => {
    api = undefined as never
    TestBed.configureTestingModule({
      providers: [
        ImportReviewStore,
        {
          provide: ImportsApi,
          useValue: { show: vi.fn(async () => Promise.reject(new TypeError('x'))) },
        },
        { provide: MonthStore, useValue: { invalidate: vi.fn(), current: () => '2026-10' } },
        { provide: HouseholdDirectory, useValue: { load: vi.fn(async () => undefined) } },
        { provide: SessionStore, useValue: { onClear: () => undefined } },
      ],
    })
    const store = TestBed.inject(ImportReviewStore)

    await store.load(7)

    expect(store.status()).toBe('error')
    expect(store.loadFailure()).toEqual({ key: 'errors.offline' })
  })

  it('test_the_summary_counts_rows_by_tone_with_the_batch_duplicates', async () => {
    const store = await setup()

    expect(store.summary()).toMatchObject({
      auto: 2,
      doubtful: 1,
      new: 1,
      ignored: 1,
      duplicate: 1,
      acceptable: 1,
    })
  })

  it('test_the_filter_narrows_the_visible_rows', async () => {
    const store = await setup()

    store.filter.set('doubtful')

    expect(store.visibleRows().map((row) => row.id)).toEqual([2])
  })

  it('test_the_blocking_filter_shows_only_the_rows_that_block_the_confirm', async () => {
    const store = await setup([
      ...rows(),
      anImportRow({ id: 6, resolution: 'needs_confirmation', match: aMatchCandidate(901) }),
    ])

    store.filter.set('blocking')

    expect(store.blocking()).toEqual([6])
    expect(store.visibleRows().map((row) => row.id)).toEqual([6])
  })

  it('test_a_batch_partly_confirmed_elsewhere_only_asks_about_its_open_rows', async () => {
    const confirmedAt = '2026-10-15T00:00:00.000Z'
    const store = await setup([
      anImportRow({ id: 1, suggestion: aTentativeSuggestion(21), confirmedAt }),
      anImportRow({ id: 2, resolution: 'transfer_leg', confirmedAt }),
      anImportRow({ id: 3, resolution: 'needs_confirmation' }),
    ])

    expect(store.summary()).toMatchObject({ auto: 1, doubtful: 1, transfer: 1, blocking: 1 })
    store.filter.set('doubtful')
    expect(store.visibleRows().map((row) => row.id)).toEqual([3])
  })

  it('test_a_decision_shows_at_once_and_takes_the_api_answer', async () => {
    const store = await setup()
    let resolve!: (row: ImportRow) => void
    api.decide.mockImplementationOnce(() => new Promise<ImportRow>((done) => (resolve = done)))

    const saving = store.decide(3, { categoryId: 22 })

    expect(store.rows()[2]?.decision).toEqual({ categoryId: 22 })
    expect(store.pending().has(3)).toBe(true)
    expect(store.canConfirm()).toBe(false)
    resolve(anImportRow({ id: 3, decision: { categoryId: 22 }, decidedAt: 'saved' }))
    await expect(saving).resolves.toBe(true)

    expect(api.decide).toHaveBeenCalledWith(7, 3, { categoryId: 22 })
    expect(store.rows()[2]?.decidedAt).toBe('saved')
    expect(store.pending().size).toBe(0)
  })

  it('test_a_refused_decision_rolls_back_and_says_why', async () => {
    const store = await setup()
    api.decide.mockRejectedValueOnce(
      httpError(422, {
        errors: [{ field: 'categoryId', rule: 'database.exists', message: 'Gone' }],
      })
    )

    await expect(store.decide(3, { categoryId: 99 })).resolves.toBe(false)

    expect(store.rows()[2]?.decision).toBeNull()
    expect(TestBed.inject(ToastStore).current()).toMatchObject({
      messageKey: 'import.toast.refused',
      params: { reason: 'Gone' },
    })
  })

  it('test_accept_suggested_without_a_selection_takes_every_suggestion', async () => {
    const store = await setup()

    await expect(store.acceptSuggested()).resolves.toBe(1)

    expect(api.decideMany).toHaveBeenCalledTimes(1)
    expect(api.decideMany).toHaveBeenCalledWith(7, [{ rowId: 2, categoryId: 21 }])
    expect(api.decide).not.toHaveBeenCalled()
    expect(TestBed.inject(ToastStore).current()).toMatchObject({
      messageKey: 'import.toast.bulkDone',
      params: { count: 1 },
      action: { labelKey: 'import.toast.undo' },
    })
  })

  it('test_a_bulk_action_is_one_request_shown_at_once_and_settled_by_its_answer', async () => {
    const store = await setup()
    let resolve!: (rows: ImportRow[]) => void
    api.decideMany.mockImplementationOnce(
      () => new Promise<ImportRow[]>((done) => (resolve = done))
    )
    store.selection.set(new Set([1, 3]))

    const ignoring = store.ignoreSelected()

    expect(store.rows().map((row) => row.resolution)).toEqual([
      'ignored',
      'new',
      'ignored',
      'auto_matched',
      'ignored',
    ])
    expect([...store.pending()]).toEqual([1, 3])
    expect(store.canConfirm()).toBe(false)
    resolve([
      anImportRow({ id: 1, resolution: 'ignored', decision: {}, decidedAt: 'saved' }),
      anImportRow({ id: 3, resolution: 'ignored', decision: {}, decidedAt: 'saved' }),
    ])
    await expect(ignoring).resolves.toBe(2)

    expect(store.rows()[0]?.decidedAt).toBe('saved')
    expect(store.pending().size).toBe(0)
    expect(store.selection().size).toBe(0)
  })

  it('test_a_bulk_action_the_api_refuses_puts_every_row_back_and_says_why', async () => {
    const store = await setup()
    api.decideMany.mockRejectedValue(httpError(500, {}))
    store.selection.set(new Set([1, 3]))

    await expect(store.ignoreSelected()).resolves.toBe(0)

    expect(TestBed.inject(ToastStore).current()?.messageKey).toBe('errors.server')
    expect(store.rows().map((row) => row.resolution)).toEqual(rows().map((row) => row.resolution))
    expect(store.rows()[0]?.decision).toBeNull()
    expect(store.selection().size).toBe(2)
  })

  it('test_undo_after_a_bulk_ignore_puts_the_rows_back_in_one_request', async () => {
    const store = await setup([
      anImportRow({ id: 1, suggestion: aTentativeSuggestion(20) }),
      anImportRow({
        id: 2,
        decision: { categoryId: 21, payee: 'Deli' },
        decidedAt: '2026-10-15T00:00:00.000Z',
      }),
    ])
    store.selection.set(new Set([1, 2]))
    await store.ignoreSelected()
    expect(store.rows().map((row) => row.resolution)).toEqual(['ignored', 'ignored'])

    TestBed.inject(ToastStore).runAction()
    await vi.waitFor(() => expect(api.decideMany).toHaveBeenCalledTimes(2))

    expect(api.decideMany).toHaveBeenLastCalledWith(7, [
      { rowId: 1, reset: true },
      { rowId: 2, reset: true, resolution: 'new', categoryId: 21, payee: 'Deli' },
    ])
    await vi.waitFor(() =>
      expect(TestBed.inject(ToastStore).current()?.messageKey).toBe('import.toast.undone')
    )
    expect(store.rows().map((row) => row.resolution)).toEqual(['new', 'new'])
    expect(store.rows()[0]?.decidedAt).toBeNull()
    expect(store.rows()[1]?.decision).toEqual({ categoryId: 21, payee: 'Deli' })
    expect(store.pending().size).toBe(0)
  })

  it('test_undo_leaves_alone_a_row_decided_again_since_the_bulk_action', async () => {
    const store = await setup([
      anImportRow({ id: 1 }),
      anImportRow({ id: 2 }),
      anImportRow({ id: 3 }),
    ])
    store.selection.set(new Set([1, 2, 3]))
    await store.ignoreSelected()
    await store.decide(2, { resolution: 'new', categoryId: 30 })

    TestBed.inject(ToastStore).runAction()
    await vi.waitFor(() => expect(api.decideMany).toHaveBeenCalledTimes(2))

    expect(api.decideMany).toHaveBeenLastCalledWith(7, [
      { rowId: 1, reset: true },
      { rowId: 3, reset: true },
    ])
    expect(store.rows()[1]?.decision).toEqual({ resolution: 'new', categoryId: 30 })
  })

  it('test_a_bulk_action_past_one_request_goes_out_in_several', async () => {
    const many = Array.from({ length: MAX_BULK_ROW_CHANGES + 1 }, (_, index) =>
      anImportRow({ id: index + 1 })
    )
    const store = await setup(many)
    store.selection.set(new Set(many.map((row) => row.id)))

    await expect(store.ignoreSelected()).resolves.toBe(MAX_BULK_ROW_CHANGES + 1)

    expect(api.decideMany).toHaveBeenCalledTimes(2)
    expect(api.decideMany.mock.calls[0]?.[1]).toHaveLength(MAX_BULK_ROW_CHANGES)
    expect(api.decideMany.mock.calls[1]?.[1]).toEqual([
      { rowId: MAX_BULK_ROW_CHANGES + 1, resolution: 'ignored' },
    ])
  })

  it('test_a_refused_undo_keeps_what_the_bulk_action_did_and_says_why', async () => {
    const store = await setup()
    store.selection.set(new Set([1]))
    await store.ignoreSelected()
    api.decideMany.mockRejectedValueOnce(httpError(500, {}))

    TestBed.inject(ToastStore).runAction()

    await vi.waitFor(() =>
      expect(TestBed.inject(ToastStore).current()?.messageKey).toBe('errors.server')
    )
    expect(store.rows()[0]?.resolution).toBe('ignored')
  })

  it('test_restore_brings_back_the_selected_ignored_rows_as_the_importer_proposed', async () => {
    const store = await setup([
      // Proposed as a possible match, ignored by a person: back to confirm, undecided.
      anImportRow({
        id: 1,
        resolution: 'ignored',
        proposedResolution: 'needs_confirmation',
        match: aMatchCandidate(900),
        decision: {},
        decidedAt: '2026-10-15T00:00:00.000Z',
      }),
      // Staged before the API kept the proposal: back to the match it found.
      anImportRow({
        id: 2,
        resolution: 'ignored',
        proposedResolution: null,
        match: aMatchCandidate(901),
      }),
      anImportRow({ id: 3, resolution: 'ignored', amountCents: 0 }),
    ])
    store.selection.set(new Set([1, 2, 3]))

    await expect(store.restoreSelected()).resolves.toBe(2)

    expect(api.decideMany).toHaveBeenCalledWith(7, [
      { rowId: 1, reset: true },
      { rowId: 2, resolution: 'auto_matched', matchTransactionId: 901 },
    ])
    expect(store.rows().map((row) => row.resolution)).toEqual([
      'needs_confirmation',
      'auto_matched',
      'ignored',
    ])
    expect(store.rows()[0]?.decidedAt).toBeNull()
    expect(store.blocking()).toEqual([1])
  })

  it('test_duplicates_are_counted_listed_apart_and_never_part_of_the_work', async () => {
    const store = await setup([...rows(), aDuplicateRow({ id: 9 })])

    expect(store.summary()).toMatchObject({ duplicate: 1, listedDuplicates: 1, total: 5 })
    expect(store.visibleRows().map((row) => row.id)).toEqual([1, 2, 3, 4, 5])
    store.filter.set('duplicate')
    expect(store.visibleRows().map((row) => row.id)).toEqual([9])
  })

  it('test_accept_suggested_with_a_selection_only_touches_the_selected_rows', async () => {
    const store = await setup([
      anImportRow({ id: 1, suggestion: aTentativeSuggestion(20) }),
      anImportRow({ id: 2, suggestion: aTentativeSuggestion(21) }),
    ])
    store.selection.set(new Set([2]))

    await store.acceptSuggested()

    expect(api.decideMany).toHaveBeenCalledTimes(1)
    expect(api.decideMany).toHaveBeenCalledWith(7, [{ rowId: 2, categoryId: 21 }])
    expect(store.selection().size).toBe(0)
  })

  it('test_accept_suggested_counts_and_accepts_guessed_transfers_with_their_account', async () => {
    const store = await setup([
      ...rows(),
      anImportRow({
        id: 6,
        resolution: 'transfer_leg',
        needsReview: true,
        reasons: ['transfer_destination_guessed'],
        transfer: {
          signal: 'linked_account_memo',
          accountId: 2,
          legTransactionId: null,
          ruleId: null,
        },
      }),
    ])

    expect(store.summary()).toMatchObject({ doubtful: 2, transfer: 0, acceptable: 2, blocking: 0 })
    expect(store.canConfirm()).toBe(true)
    await expect(store.acceptSuggested()).resolves.toBe(2)

    expect(api.decideMany).toHaveBeenCalledWith(7, [
      { rowId: 2, categoryId: 21 },
      { rowId: 6, resolution: 'transfer_leg', transferAccountId: 2 },
    ])
    expect(store.summary()).toMatchObject({ doubtful: 0, transfer: 1, acceptable: 0 })
  })

  it('test_assign_category_and_ignore_apply_to_the_selected_rows', async () => {
    const store = await setup()
    store.selection.set(new Set([2, 3, 4]))

    await store.assignCategory(30)

    expect(api.decideMany).toHaveBeenLastCalledWith(7, [
      { rowId: 2, categoryId: 30 },
      { rowId: 3, categoryId: 30 },
    ])

    store.selection.set(new Set([1, 5]))
    await store.ignoreSelected()

    expect(api.decideMany).toHaveBeenLastCalledWith(7, [{ rowId: 1, resolution: 'ignored' }])
  })

  it('test_confirm_sends_the_decisions_remembers_the_result_and_invalidates_the_months', async () => {
    const store = await setup()
    await store.decide(3, { categoryId: 22 })

    const result = await store.confirm()

    expect(api.confirm).toHaveBeenCalledWith(7, [{ rowId: 3, resolution: 'new', categoryId: 22 }])
    expect(result?.created).toBe(3)
    expect(TestBed.inject(ImportResults).get(7)?.result.created).toBe(3)
    expect(TestBed.inject(ImportResults).get(7)?.batch.dateTo).toBe('2026-09-27')
    // The file's months, then the current one (recurring payments were detected again).
    expect(months.invalidate.mock.calls.map((call) => call[0])).toEqual([
      '2026-08',
      '2026-09',
      '2026-10',
    ])
  })

  it('test_confirming_an_old_file_still_refreshes_the_current_month', async () => {
    const store = await setup()
    months.current = () => '2027-04'
    await store.decide(3, { categoryId: 22 })

    await store.confirm()

    // August and September 2026 are far outside April's trend window; April
    // still reloads, since detection may have found a new recurring payment.
    expect(months.invalidate.mock.calls.map((call) => call[0])).toEqual([
      '2026-08',
      '2026-09',
      '2027-04',
    ])
  })

  it('test_confirm_waits_while_rows_need_a_decision', async () => {
    const store = await setup([anImportRow({ id: 1, resolution: 'needs_confirmation' })])

    expect(store.blocking()).toEqual([1])
    expect(store.canConfirm()).toBe(false)
    await expect(store.confirm()).resolves.toBeNull()
    expect(api.confirm).not.toHaveBeenCalled()
  })

  it('test_a_confirm_refused_for_undecided_rows_reloads_and_shows_only_the_blocking_ones', async () => {
    const store = await setup()
    api.confirm.mockRejectedValueOnce(
      httpError(422, { message: 'x', code: 'E_IMPORT_ROWS_UNDECIDED', rowIds: [2] })
    )

    await expect(store.confirm()).resolves.toBeNull()

    expect(api.show).toHaveBeenCalledTimes(2)
    expect(store.filter()).toBe('blocking')
    expect(TestBed.inject(ToastStore).current()?.messageKey).toBe('import.toast.undecided')
  })

  it('test_classify_with_the_run_already_finished_reloads_the_rows_once', async () => {
    vi.useFakeTimers()
    const store = await setup([anImportRow({ id: 1 }), anImportRow({ id: 2 })])
    api.classify.mockResolvedValue(
      anImportBatch({ classifying: false, classifiedAt: '2026-10-16T00:00:00.000Z' })
    )
    api.show.mockResolvedValue(
      anImportDetail([
        anImportRow({ id: 1, suggestion: aTentativeSuggestion(20, 0.6) }),
        anImportRow({ id: 2, suggestion: { ...aTrustedSuggestion(21), source: 'llm' } }),
      ])
    )

    const running = store.classify()
    expect(store.classifying()).toBe(true)
    await running

    expect(api.classify).toHaveBeenCalledWith(7)
    expect(api.batch).not.toHaveBeenCalled()
    expect(api.show).toHaveBeenCalledTimes(2)
    expect(store.rows()[0]?.suggestion?.source).toBe('llm')
    expect(store.classifying()).toBe(false)
    expect(TestBed.inject(ToastStore).current()?.messageKey).toBe('import.toast.classified')
  })

  it('test_classify_polls_the_batch_alone_while_the_run_lasts_then_reloads_the_rows', async () => {
    vi.useFakeTimers()
    const store = await setup([anImportRow({ id: 1 })])
    api.classify.mockResolvedValue(anImportBatch({ classifying: true }))
    api.batch
      .mockResolvedValueOnce(anImportBatch({ classifying: true }))
      .mockResolvedValueOnce(anImportBatch({ classifying: false }))
    api.show.mockResolvedValue(
      anImportDetail([anImportRow({ id: 1, suggestion: aTentativeSuggestion(20) })])
    )

    const running = store.classify()
    await vi.advanceTimersByTimeAsync(0)
    expect(api.batch).not.toHaveBeenCalled()
    expect(api.show).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(CLASSIFY_POLL_MS)
    expect(api.batch).toHaveBeenCalledWith(7)
    expect(api.show).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(CLASSIFY_POLL_MS)
    await running

    expect(api.batch).toHaveBeenCalledTimes(2)
    expect(api.show).toHaveBeenCalledTimes(2)
    expect(store.rows()[0]?.suggestion?.categoryId).toBe(20)
    expect(store.classifying()).toBe(false)
  })

  it('test_a_run_that_never_ends_is_followed_for_a_bounded_time', async () => {
    vi.useFakeTimers()
    const store = await setup([anImportRow({ id: 1 })])
    api.classify.mockResolvedValue(anImportBatch({ classifying: true }))
    api.batch.mockResolvedValue(anImportBatch({ classifying: true }))

    const running = store.classify()
    await vi.advanceTimersByTimeAsync(CLASSIFY_POLL_MS * (CLASSIFY_MAX_POLLS + 1))
    await running

    expect(api.batch).toHaveBeenCalledTimes(CLASSIFY_MAX_POLLS)
    expect(api.show).toHaveBeenCalledTimes(2)
    expect(store.classifying()).toBe(false)
    // The run may still be going: nothing is announced.
    expect(TestBed.inject(ToastStore).current()?.messageKey).not.toBe('import.toast.classified')
  })

  it('test_a_classification_already_running_is_followed_instead', async () => {
    vi.useFakeTimers()
    const store = await setup([anImportRow({ id: 1 })])
    api.classify.mockRejectedValueOnce(
      httpError(409, { message: 'x', code: 'E_IMPORT_CLASSIFY_RUNNING' })
    )
    api.batch.mockResolvedValue(anImportBatch({ classifying: false }))
    api.show.mockResolvedValue(
      anImportDetail([anImportRow({ id: 1, suggestion: aTentativeSuggestion(20) })])
    )

    const running = store.classify()
    await vi.advanceTimersByTimeAsync(CLASSIFY_POLL_MS)
    await running

    expect(api.batch).toHaveBeenCalledTimes(1)
    expect(api.show).toHaveBeenCalledTimes(2)
    expect(TestBed.inject(ToastStore).current()?.messageKey).toBe('import.toast.classified')
  })

  it('test_a_run_going_on_when_the_review_opens_is_followed_until_it_ends', async () => {
    vi.useFakeTimers()
    const store = await setup([anImportRow({ id: 1 })], anImportBatch({ classifying: true }))
    api.batch.mockResolvedValue(anImportBatch({ classifying: false }))

    expect(store.classifying()).toBe(true)
    await vi.advanceTimersByTimeAsync(CLASSIFY_POLL_MS)

    expect(api.batch).toHaveBeenCalledTimes(1)
    expect(api.show).toHaveBeenCalledTimes(2)
    expect(store.classifying()).toBe(false)
  })

  it('test_cancel_closes_the_batch', async () => {
    const store = await setup()

    await expect(store.cancel()).resolves.toBe(true)

    expect(api.cancel).toHaveBeenCalledWith(7)
    expect(store.batch()?.status).toBe('cancelled')
    expect(store.isStaged()).toBe(false)
  })
})
