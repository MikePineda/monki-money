import { TestBed } from '@angular/core/testing'
import { TuyauHTTPError } from '@tuyau/core/client'
import {
  aMatchCandidate,
  aTentativeSuggestion,
  aTrustedSuggestion,
  anImportBatch,
  anImportDetail,
  anImportRow,
} from '../../../testing/import-fixtures'
import type { ImportRow } from '../../core/api/api-types'
import { SessionStore } from '../../core/auth/session.store'
import { HouseholdDirectory } from '../../core/household/household-directory.store'
import { MonthStore } from '../../core/month/month.store'
import { ToastStore } from '../../core/ui/toast.store'
import { ImportResults } from './data-access/import-results'
import { ImportsApi } from './data-access/imports.api'
import { CLASSIFY_POLL_MS, ImportReviewStore } from './import-review.store'

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
  let api: Record<'show' | 'decide' | 'classify' | 'confirm' | 'cancel', ReturnType<typeof vi.fn>>
  let months: { invalidate: ReturnType<typeof vi.fn>; current: () => string }

  async function setup(initial: ImportRow[] = rows()) {
    api = {
      show: vi.fn(async () => anImportDetail(initial)),
      decide: vi.fn(async (_id: number, rowId: number, change: { categoryId?: number }) => {
        const row = initial.find((item) => item.id === rowId) as ImportRow
        return { ...row, decision: { ...change }, decidedAt: '2026-10-16T00:00:00.000Z' }
      }),
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

    expect(api.decide).toHaveBeenCalledTimes(1)
    expect(api.decide).toHaveBeenCalledWith(7, 2, { categoryId: 21 })
    expect(TestBed.inject(ToastStore).current()).toMatchObject({
      messageKey: 'import.toast.bulkDone',
      params: { count: 1 },
    })
  })

  it('test_a_bulk_action_the_api_refuses_entirely_keeps_the_refusal_on_screen', async () => {
    const store = await setup()
    api.decide.mockRejectedValue(httpError(500, {}))

    await expect(store.acceptSuggested()).resolves.toBe(0)

    expect(TestBed.inject(ToastStore).current()?.messageKey).toBe('errors.server')
    expect(store.rows()[1]?.decision).toBeNull()
  })

  it('test_accept_suggested_with_a_selection_only_touches_the_selected_rows', async () => {
    const store = await setup([
      anImportRow({ id: 1, suggestion: aTentativeSuggestion(20) }),
      anImportRow({ id: 2, suggestion: aTentativeSuggestion(21) }),
    ])
    store.selection.set(new Set([2]))

    await store.acceptSuggested()

    expect(api.decide).toHaveBeenCalledTimes(1)
    expect(api.decide).toHaveBeenCalledWith(7, 2, { categoryId: 21 })
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

    expect(api.decide).toHaveBeenCalledWith(7, 2, { categoryId: 21 })
    expect(api.decide).toHaveBeenCalledWith(7, 6, {
      resolution: 'transfer_leg',
      transferAccountId: 2,
    })
    expect(store.summary()).toMatchObject({ doubtful: 0, transfer: 1, acceptable: 0 })
  })

  it('test_assign_category_and_ignore_apply_to_the_selected_rows', async () => {
    const store = await setup()
    store.selection.set(new Set([2, 3, 4]))

    await store.assignCategory(30)

    expect(api.decide.mock.calls.map((call) => [call[1], call[2]])).toEqual([
      [2, { categoryId: 30 }],
      [3, { categoryId: 30 }],
    ])

    api.decide.mockClear()
    store.selection.set(new Set([1, 5]))
    await store.ignoreSelected()

    expect(api.decide.mock.calls.map((call) => [call[1], call[2]])).toEqual([
      [1, { resolution: 'ignored' }],
    ])
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

  it('test_classify_polls_until_the_model_answered_every_row_it_could', async () => {
    vi.useFakeTimers()
    const store = await setup([anImportRow({ id: 1 }), anImportRow({ id: 2 })])
    const classified = [
      anImportRow({ id: 1, suggestion: aTentativeSuggestion(20, 0.6) }),
      anImportRow({ id: 2, suggestion: { ...aTrustedSuggestion(21), source: 'llm' } }),
    ]
    api.show.mockResolvedValue(anImportDetail(classified))

    const running = store.classify()
    expect(store.classifying()).toBe(true)
    await running

    expect(api.classify).toHaveBeenCalledWith(7)
    expect(api.show).toHaveBeenCalledTimes(2)
    expect(store.rows()[0]?.suggestion?.source).toBe('llm')
    expect(store.classifying()).toBe(false)
    expect(TestBed.inject(ToastStore).current()?.messageKey).toBe('import.toast.classified')
  })

  it('test_classify_keeps_polling_every_two_seconds_until_two_polls_agree', async () => {
    vi.useFakeTimers()
    const store = await setup([anImportRow({ id: 1 }), anImportRow({ id: 2 })])
    const halfway = anImportDetail([
      anImportRow({ id: 1, suggestion: aTentativeSuggestion(20) }),
      anImportRow({ id: 2 }),
    ])
    api.show.mockResolvedValue(halfway)

    const running = store.classify()
    await vi.advanceTimersByTimeAsync(0)
    expect(api.show).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(CLASSIFY_POLL_MS)
    await running

    expect(api.show).toHaveBeenCalledTimes(3)
    expect(store.classifying()).toBe(false)
  })

  it('test_a_classification_already_running_is_followed_instead', async () => {
    vi.useFakeTimers()
    const store = await setup([anImportRow({ id: 1 })])
    api.classify.mockRejectedValueOnce(
      httpError(409, { message: 'x', code: 'E_IMPORT_CLASSIFY_RUNNING' })
    )
    api.show.mockResolvedValue(
      anImportDetail([anImportRow({ id: 1, suggestion: aTentativeSuggestion(20) })])
    )

    await store.classify()

    expect(api.show).toHaveBeenCalledTimes(2)
    expect(TestBed.inject(ToastStore).current()?.messageKey).toBe('import.toast.classified')
  })

  it('test_cancel_closes_the_batch', async () => {
    const store = await setup()

    await expect(store.cancel()).resolves.toBe(true)

    expect(api.cancel).toHaveBeenCalledWith(7)
    expect(store.batch()?.status).toBe('cancelled')
    expect(store.isStaged()).toBe(false)
  })
})
