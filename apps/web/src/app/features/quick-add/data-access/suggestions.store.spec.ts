import { TestBed } from '@angular/core/testing'
import type { TransactionSuggestions } from '@monkimoney/shared'
import { networkError } from '../../../../testing/session-fixtures'
import { SessionStore } from '../../../core/auth/session.store'
import { TransactionsApi } from '../../../core/ledger/transactions.api'
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

  function setup(): SuggestionsStore {
    api = { suggestions: vi.fn(async () => suggestions(1)) }
    clearHooks = []
    TestBed.configureTestingModule({
      providers: [
        { provide: TransactionsApi, useValue: api },
        {
          provide: SessionStore,
          useValue: { onClear: (hook: () => void) => clearHooks.push(hook) },
        },
      ],
    })
    return TestBed.inject(SuggestionsStore)
  }

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

  it('test_logout_forgets_them_even_with_a_request_in_flight', async () => {
    const store = setup()
    await store.load()
    let answer: (value: TransactionSuggestions) => void = () => undefined
    api.suggestions.mockImplementationOnce(
      () => new Promise<TransactionSuggestions>((resolve) => (answer = resolve))
    )

    const inFlight = store.load()
    clearHooks.forEach((hook) => hook())
    answer(suggestions(9))
    await inFlight
    api.suggestions.mockRejectedValueOnce(networkError())

    // The previous person's rankings never come back.
    expect(await store.load()).toBeNull()
  })
})
