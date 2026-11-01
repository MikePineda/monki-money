import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import type { TransactionSuggestions } from '@monkimoney/shared'
import { aMe, httpError, networkError } from '../../../../testing/session-fixtures'
import type { Me } from '../../../core/auth/auth.api'
import { SessionStore } from '../../../core/auth/session.store'
import { TransactionsApi } from '../../../core/ledger/transactions.api'
import { OfflineCache } from '../../../core/platform/offline-cache'
import { SuggestionsStore } from './suggestions.store'

function suggestions(lastAccountId: number): TransactionSuggestions {
  return {
    asOf: '2026-10-16',
    categories: { expense: [{ categoryId: 20, score: 1, lastDate: '2026-10-16' }], income: [] },
    payees: { expense: [], income: [] },
    routes: [],
    lastAccountId,
  }
}

describe('SuggestionsStore', () => {
  let api: { suggestions: ReturnType<typeof vi.fn> }
  let clearHooks: (() => void)[]
  let me: ReturnType<typeof signal<Me | null>>

  function setup(): SuggestionsStore {
    api = { suggestions: vi.fn(async () => suggestions(1)) }
    clearHooks = []
    me = signal<Me | null>(aMe())
    TestBed.configureTestingModule({
      providers: [
        { provide: TransactionsApi, useValue: api },
        {
          provide: SessionStore,
          useValue: { me, onClear: (hook: () => void) => clearHooks.push(hook) },
        },
      ],
    })
    return TestBed.inject(SuggestionsStore)
  }

  /** The person and household `aMe()` signs in as. */
  function owner(): [number, number] {
    const current = aMe()
    return [current.user.id, current.household?.id ?? 0]
  }

  afterEach(() => localStorage.clear())

  it('test_every_visit_asks_the_server_again', async () => {
    const store = setup()

    expect(await store.load()).toEqual(suggestions(1))
    api.suggestions.mockResolvedValueOnce(suggestions(2))
    expect((await store.load())?.lastAccountId).toBe(2)
    expect(api.suggestions).toHaveBeenCalledTimes(2)
  })

  it('test_offline_it_falls_back_to_what_this_session_already_had', async () => {
    const store = setup()
    await store.load()
    api.suggestions.mockRejectedValueOnce(networkError())

    expect(await store.load()).toEqual(suggestions(1))
  })

  it('test_without_anything_cached_a_failure_gives_nothing', async () => {
    const store = setup()
    api.suggestions.mockRejectedValueOnce(networkError())

    expect(await store.load()).toBeNull()
  })

  it('test_a_fresh_answer_is_kept_on_the_device_for_the_person_and_household', async () => {
    const store = setup()

    await store.load()

    expect(TestBed.inject(OfflineCache).readSuggestions(...owner())).toEqual(suggestions(1))
  })

  it('test_an_app_started_offline_ranks_from_the_answer_kept_on_the_device', async () => {
    const store = setup()
    TestBed.inject(OfflineCache).writeSuggestions(...owner(), suggestions(4))
    api.suggestions.mockRejectedValueOnce(networkError())

    expect(await store.load()).toEqual(suggestions(4))
  })

  it('test_a_server_error_at_a_cold_start_also_opens_on_the_kept_answer', async () => {
    const store = setup()
    TestBed.inject(OfflineCache).writeSuggestions(...owner(), suggestions(4))
    api.suggestions.mockRejectedValueOnce(httpError(503))

    expect((await store.load())?.lastAccountId).toBe(4)
  })

  it('test_the_answer_kept_for_another_household_is_never_used', async () => {
    const [userId] = owner()
    const store = setup()
    TestBed.inject(OfflineCache).writeSuggestions(userId, 999, suggestions(4))
    api.suggestions.mockRejectedValueOnce(networkError())

    expect(await store.load()).toBeNull()
  })

  it('test_without_a_household_nothing_is_kept_or_read', async () => {
    const store = setup()
    me.set({ ...aMe(), household: null })

    await store.load()
    api.suggestions.mockRejectedValueOnce(networkError())
    clearHooks.forEach((hook) => hook())

    expect(await store.load()).toBeNull()
    expect(localStorage.length).toBe(0)
  })

  it('test_logout_forgets_them_even_with_a_request_in_flight', async () => {
    const store = setup()
    await store.load()
    let answer: (value: TransactionSuggestions) => void = () => undefined
    api.suggestions.mockImplementationOnce(
      () => new Promise<TransactionSuggestions>((resolve) => (answer = resolve))
    )

    const inFlight = store.load()
    me.set(null)
    clearHooks.forEach((hook) => hook())
    answer(suggestions(9))
    await inFlight
    api.suggestions.mockRejectedValueOnce(networkError())

    // The previous person's rankings never come back.
    expect(await store.load()).toBeNull()
  })
})
