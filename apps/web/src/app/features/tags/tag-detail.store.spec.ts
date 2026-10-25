import { ApplicationRef, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { aTagDetail } from '../../../testing/tag-fixtures'
import { httpError, networkError } from '../../../testing/session-fixtures'
import { TagsApi } from '../../core/ledger/tags.api'
import { MonthStore } from '../../core/month/month.store'
import { TagDetailStore } from './tag-detail.store'

describe('TagDetailStore', () => {
  let api: { show: ReturnType<typeof vi.fn> }
  let ledgerRevision: ReturnType<typeof signal<number>>

  function setup(tag = 'Bali 2027') {
    api = { show: vi.fn(async (name: string) => aTagDetail({ tag: name })) }
    ledgerRevision = signal(0)
    TestBed.configureTestingModule({
      providers: [
        TagDetailStore,
        { provide: TagsApi, useValue: api },
        { provide: MonthStore, useValue: { ledgerRevision } },
      ],
    })
    const store = TestBed.inject(TagDetailStore)
    store.open(tag)
    return store
  }

  async function settle(): Promise<void> {
    TestBed.tick()
    await TestBed.inject(ApplicationRef).whenStable()
  }

  it('test_loads_the_tag_it_was_opened_with', async () => {
    const store = setup('Bali / Lombok')
    expect(store.status()).toBe('loading')

    await settle()

    expect(api.show).toHaveBeenCalledWith('Bali / Lombok', {})
    expect(store.status()).toBe('ready')
    expect(store.detail()?.tag).toBe('Bali / Lombok')
  })

  it('test_a_tag_nobody_uses_is_not_found', async () => {
    const store = setup()
    api.show.mockRejectedValueOnce(httpError(404, { code: 'E_ROW_NOT_FOUND' }))

    await settle()

    expect(store.status()).toBe('notFound')
  })

  it('test_a_failed_load_is_an_error_that_retry_fixes', async () => {
    const store = setup()
    api.show.mockRejectedValueOnce(networkError())
    await settle()
    expect(store.status()).toBe('error')

    store.retry()
    await settle()

    expect(store.status()).toBe('ready')
  })

  it('test_a_change_in_the_ledger_reads_the_tag_again_keeping_it_on_screen', async () => {
    const store = setup()
    await settle()
    // On screen.
    expect(store.detail()?.expenseCents).toBe(13_000)
    api.show.mockResolvedValueOnce(aTagDetail({ expenseCents: 20_000 }))

    ledgerRevision.set(1)
    TestBed.tick()
    expect(store.status()).toBe('ready')
    expect(store.detail()?.expenseCents).toBe(13_000)
    await settle()

    expect(api.show).toHaveBeenCalledTimes(2)
    expect(store.detail()?.expenseCents).toBe(20_000)
  })

  it('test_a_date_range_reads_the_tag_for_those_dates_keeping_it_on_screen', async () => {
    const store = setup()
    await settle()
    api.show.mockResolvedValueOnce(aTagDetail({ expenseCents: 5_000 }))

    store.setRange({ from: '2026-01-01', to: '2026-12-31' })
    TestBed.tick()
    expect(store.detail()?.expenseCents).toBe(13_000)
    await settle()

    expect(api.show).toHaveBeenLastCalledWith('Bali 2027', { from: '2026-01-01', to: '2026-12-31' })
    expect(store.detail()?.expenseCents).toBe(5_000)
  })
})
