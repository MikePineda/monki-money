import { ApplicationRef, computed, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { networkError } from '../../../testing/session-fixtures'
import { aTagSummary } from '../../../testing/tag-fixtures'
import { TagsApi, type TagSummary } from '../../core/ledger/tags.api'
import { TagsStore, type TagsStatus } from '../../core/ledger/tags.store'
import { MonthStore } from '../../core/month/month.store'
import { TagsListStore } from './tags-list.store'

describe('TagsListStore', () => {
  let api: { list: ReturnType<typeof vi.fn> }
  let shared: {
    tags: ReturnType<typeof signal<TagSummary[]>>
    status: ReturnType<typeof signal<TagsStatus>>
    load: ReturnType<typeof vi.fn>
    refresh: ReturnType<typeof vi.fn>
  }
  let ledgerRevision: ReturnType<typeof signal<number>>

  function setup() {
    api = { list: vi.fn(async () => [aTagSummary({ tag: 'This year', expenseCents: 500 })]) }
    shared = {
      tags: signal([aTagSummary()]),
      status: signal<TagsStatus>('ready'),
      load: vi.fn(async () => undefined),
      refresh: vi.fn(async () => undefined),
    }
    ledgerRevision = signal(0)
    TestBed.configureTestingModule({
      providers: [
        TagsListStore,
        { provide: TagsApi, useValue: api },
        { provide: TagsStore, useValue: shared },
        {
          provide: MonthStore,
          useValue: { ledgerRevision, current: computed(() => '2026-10') },
        },
      ],
    })
    return TestBed.inject(TagsListStore)
  }

  async function settle(): Promise<void> {
    TestBed.tick()
    await TestBed.inject(ApplicationRef).whenStable()
  }

  it('test_every_date_is_the_shared_list_with_no_extra_request', async () => {
    const store = setup()
    store.load()
    await settle()

    expect(store.period()).toBe('all')
    expect(store.tags().map((tag) => tag.tag)).toEqual(['Bali 2027'])
    expect(store.status()).toBe('ready')
    expect(shared.load).toHaveBeenCalled()
    expect(api.list).not.toHaveBeenCalled()
  })

  it('test_a_period_reads_the_tags_of_its_dates', async () => {
    const store = setup()

    store.setPeriod('thisYear')
    expect(store.status()).toBe('loading')
    await settle()

    expect(api.list).toHaveBeenCalledWith({ from: '2026-01-01', to: '2026-12-31' })
    expect(store.tags().map((tag) => tag.tag)).toEqual(['This year'])
    expect(store.status()).toBe('ready')
  })

  it('test_a_change_in_the_ledger_reads_the_period_again', async () => {
    const store = setup()
    store.setPeriod('last12')
    await settle()

    ledgerRevision.set(1)
    await settle()

    expect(api.list).toHaveBeenCalledTimes(2)
    expect(api.list).toHaveBeenLastCalledWith({ from: '2025-11-01' })
  })

  it('test_a_failed_period_is_an_error_that_retry_fixes', async () => {
    const store = setup()
    api.list.mockRejectedValueOnce(networkError())
    store.setPeriod('lastYear')
    await settle()
    expect(store.status()).toBe('error')

    store.retry()
    await settle()

    expect(store.status()).toBe('ready')
  })
})
