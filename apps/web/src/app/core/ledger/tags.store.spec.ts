import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { aTagSummary } from '../../../testing/tag-fixtures'
import { networkError } from '../../../testing/session-fixtures'
import { SessionStore } from '../auth/session.store'
import { MonthStore } from '../month/month.store'
import { TagsApi } from './tags.api'
import { TagsStore } from './tags.store'

describe('TagsStore', () => {
  let api: { list: ReturnType<typeof vi.fn> }
  let ledgerRevision: ReturnType<typeof signal<number>>
  let clearHooks: (() => void)[]

  function setup() {
    api = {
      list: vi.fn(async () => [
        aTagSummary({ tag: 'Bali 2027', lastDate: '2027-01-10' }),
        aTagSummary({ tag: 'camping', lastDate: '2026-10-20' }),
      ]),
    }
    ledgerRevision = signal(0)
    clearHooks = []
    TestBed.configureTestingModule({
      providers: [
        { provide: TagsApi, useValue: api },
        { provide: MonthStore, useValue: { ledgerRevision } },
        {
          provide: SessionStore,
          useValue: { onClear: (hook: () => void) => clearHooks.push(hook) },
        },
      ],
    })
    return TestBed.inject(TagsStore)
  }

  it('test_loads_the_tags_once_most_recently_used_first', async () => {
    const store = setup()
    expect(store.status()).toBe('loading')

    await Promise.all([store.load(), store.load()])
    await store.load()

    expect(api.list).toHaveBeenCalledTimes(1)
    expect(store.status()).toBe('ready')
    expect(store.names()).toEqual(['Bali 2027', 'camping'])
    expect(store.tags()[0]?.setAsideCents).toBe(80_000)
  })

  it('test_loads_again_once_the_ledger_changed', async () => {
    const store = setup()
    await store.load()

    ledgerRevision.set(1)
    api.list.mockResolvedValueOnce([aTagSummary({ tag: 'Lombok' })])
    await store.load()

    expect(api.list).toHaveBeenCalledTimes(2)
    expect(store.names()).toEqual(['Lombok'])
  })

  it('test_refresh_always_asks_again', async () => {
    const store = setup()
    await store.load()

    await store.refresh()

    expect(api.list).toHaveBeenCalledTimes(2)
  })

  it('test_a_failed_first_load_is_an_error_that_a_retry_fixes', async () => {
    const store = setup()
    api.list.mockRejectedValueOnce(networkError())

    await store.load()
    expect(store.status()).toBe('error')
    expect(store.names()).toEqual([])

    await store.load()
    expect(store.status()).toBe('ready')
  })

  it('test_a_failed_reload_keeps_the_last_list', async () => {
    const store = setup()
    await store.load()
    api.list.mockRejectedValueOnce(networkError())

    await store.refresh()

    expect(store.status()).toBe('ready')
    expect(store.names()).toEqual(['Bali 2027', 'camping'])
  })

  it('test_logout_forgets_the_tags', async () => {
    const store = setup()
    await store.load()

    clearHooks.forEach((hook) => hook())

    expect(store.names()).toEqual([])
    expect(store.status()).toBe('loading')
    await store.load()
    expect(api.list).toHaveBeenCalledTimes(2)
  })
})
