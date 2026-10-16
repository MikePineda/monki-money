import { ApplicationRef } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { aTransaction, aTransferPair, aCategoryTree } from '../../../testing/ledger-fixtures'
import { aUser, anAccount, httpError } from '../../../testing/session-fixtures'
import { SessionStore } from '../../core/auth/session.store'
import { AccountsApi } from '../../core/household/accounts.api'
import { CategoriesApi } from '../../core/household/categories.api'
import { MonthStore } from '../../core/month/month.store'
import { HOUSEHOLD_TIME_ZONE } from '../../core/platform/time-zone.token'
import { ToastStore } from '../../core/ui/toast.store'
import type { YearMonth } from '../../domain/month'
import type { Transaction, Transfer } from '../../core/api/api-types'
import { TransactionsApi, type TransactionPage } from './data-access/transactions.api'
import { TransfersApi } from './data-access/transfers.api'
import { TransactionsStore } from './transactions.store'

function page(rows: Transaction[], current = 1, lastPage = 1): TransactionPage {
  return { rows, page: current, lastPage, total: rows.length }
}

/** Resolves when every pending promise has run and the resource settled. */
async function settle(): Promise<void> {
  await TestBed.inject(ApplicationRef).whenStable()
}

describe('TransactionsStore', () => {
  let api: Record<
    'list' | 'show' | 'create' | 'update' | 'remove' | 'updateSplits',
    ReturnType<typeof vi.fn>
  >
  let transfers: Record<'show' | 'create' | 'update' | 'remove', ReturnType<typeof vi.fn>>

  function setup(pages: TransactionPage[] = [page([aTransaction({ id: 1 })])]) {
    api = {
      list: vi.fn(async (query: { page: number }) => pages[query.page - 1] ?? page([])),
      show: vi.fn(),
      create: vi.fn(async (body: object) => aTransaction({ id: 999, ...body })),
      update: vi.fn(),
      remove: vi.fn(async () => undefined),
      updateSplits: vi.fn(),
    }
    transfers = {
      show: vi.fn(async (id: number) => {
        const [out, incoming] = aTransferPair(id)
        return {
          id,
          date: out.date,
          amountCents: 50000,
          fromAccountId: 1,
          toAccountId: 2,
          memo: 'Rainy day',
          legs: [out, incoming],
        } as unknown as Transfer
      }),
      create: vi.fn(async () => ({ id: 77 })),
      update: vi.fn(),
      remove: vi.fn(async () => undefined),
    }
    TestBed.configureTestingModule({
      providers: [
        TransactionsStore,
        { provide: TransactionsApi, useValue: api },
        { provide: TransfersApi, useValue: transfers },
        { provide: AccountsApi, useValue: { list: vi.fn(async () => [anAccount({ id: 1 })]) } },
        { provide: CategoriesApi, useValue: { tree: vi.fn(async () => aCategoryTree()) } },
        { provide: SessionStore, useValue: { onClear: () => undefined, user: () => aUser() } },
        { provide: HOUSEHOLD_TIME_ZONE, useValue: () => 'Australia/Brisbane' },
      ],
    })
    return TestBed.inject(TransactionsStore)
  }

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-10-15T02:00:00.000Z'), toFake: ['Date'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('test_first_load_asks_for_page_one_of_the_selected_month', async () => {
    const store = setup()
    await settle()

    expect(api.list).toHaveBeenCalledWith(
      { month: '2026-10', page: 1, perPage: 50 },
      expect.anything()
    )
    expect(store.rows().map((row) => row.id)).toEqual([1])
  })

  it('test_filters_become_the_list_query', async () => {
    const store = setup()
    await settle()

    store.setAccount(3)
    store.setPaidBy(7)
    store.setCategory({ type: 'category', id: 20 })
    store.setSearch('grocer')
    await settle()

    expect(api.list).toHaveBeenLastCalledWith(
      {
        month: '2026-10',
        accountId: [3],
        paidByUserId: 7,
        categoryId: [20],
        q: 'grocer',
        page: 1,
        perPage: 50,
      },
      expect.anything()
    )
    expect(store.hasNarrowingFilters()).toBe(true)
  })

  it('test_the_month_is_shared_with_the_month_store', async () => {
    const store = setup()
    await settle()

    TestBed.inject(MonthStore).selectedMonth.set('2026-09' as YearMonth)
    await settle()

    expect(store.filters().month).toBe('2026-09')
    expect(api.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ month: '2026-09' }),
      expect.anything()
    )
  })

  it('test_a_tag_filter_spans_every_month_until_a_month_is_picked', async () => {
    const store = setup()
    await settle()

    store.setTag('Bali 2027')
    await settle()
    expect(store.filters().month).toBeNull()
    expect(store.hasNarrowingFilters()).toBe(true)
    expect(api.list).toHaveBeenLastCalledWith(
      { tag: 'Bali 2027', page: 1, perPage: 50 },
      expect.anything()
    )

    store.setMonth('2026-09' as YearMonth)
    await settle()
    expect(api.list).toHaveBeenLastCalledWith(
      { month: '2026-09', tag: 'Bali 2027', page: 1, perPage: 50 },
      expect.anything()
    )

    store.showAllMonths()
    await settle()
    expect(store.filters().month).toBeNull()

    store.clearFilters()
    await settle()
    expect(store.filters()).toEqual(expect.objectContaining({ month: '2026-09', tag: null }))
    expect(api.list).toHaveBeenLastCalledWith(
      { month: '2026-09', page: 1, perPage: 50 },
      expect.anything()
    )
  })

  it('test_a_list_over_every_month_reloads_after_a_change_in_any_month', async () => {
    const store = setup()
    store.setTag('Bali 2027')
    await settle()
    const calls = api.list.mock.calls.length

    TestBed.inject(MonthStore).invalidate('2026-03' as YearMonth)
    await settle()

    expect(api.list.mock.calls.length).toBe(calls + 1)
  })

  it('test_a_transfer_keeps_its_tags_when_edited_and_when_undone', async () => {
    const [out, incoming] = aTransferPair(9).map((leg) => ({ ...leg, tags: ['Bali 2027'] }))
    const store = setup([page([out as Transaction, incoming as Transaction])])
    await settle()

    const details = await store.transferOf(out as Transaction)
    expect(details.tags).toEqual(['Bali 2027'])

    await store.updateTransfer(details, { tags: ['Bali 2027', 'Lombok'] })
    expect(transfers.update).toHaveBeenCalledWith(9, { tags: ['Bali 2027', 'Lombok'] })

    await store.duplicate(out as Transaction)
    expect(transfers.create).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ['Bali 2027'], amountCents: 50000 })
    )
  })

  it('test_a_leg_whose_partner_is_not_listed_reads_its_transfer_in_one_call', async () => {
    // Filtered by the source account: only the outgoing leg is on screen.
    const [out] = aTransferPair(9)
    const store = setup([page([out])])
    await settle()

    const details = await store.transferOf(out)

    expect(transfers.show).toHaveBeenCalledExactlyOnceWith(9)
    expect(details).toMatchObject({
      transferId: 9,
      fromAccountId: 1,
      toAccountId: 2,
      amountCents: 50000,
      memo: 'Rainy day',
    })
  })

  it('test_a_transfer_with_both_legs_listed_needs_no_request', async () => {
    const store = setup([page(aTransferPair(9))])
    await settle()

    const details = await store.transferOf(store.rows()[0] as Transaction)

    expect(transfers.show).not.toHaveBeenCalled()
    expect(details).toMatchObject({ fromAccountId: 1, toAccountId: 2 })
  })

  it('test_the_joint_filter_asks_for_rows_without_a_payer', async () => {
    const store = setup()
    await settle()

    store.setPaidBy('joint')
    await settle()

    expect(api.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ paidBy: 'joint' }),
      expect.anything()
    )
    expect(api.list.mock.lastCall?.[0]).not.toHaveProperty('paidByUserId')
    expect(store.hasNarrowingFilters()).toBe(true)
  })

  it('test_load_more_fetches_only_the_next_page_and_appends_it', async () => {
    const store = setup([
      page([aTransaction({ id: 1 }), aTransaction({ id: 2 })], 1, 2),
      page([aTransaction({ id: 3 })], 2, 2),
    ])
    await settle()
    expect(store.hasMore()).toBe(true)

    store.loadMore()
    TestBed.tick()
    // The rows on screen stay put (not dimmed) while the next page loads.
    expect(store.loadingMore()).toBe(true)
    expect(store.refreshing()).toBe(false)
    expect(store.rows().map((row) => row.id)).toEqual([1, 2])
    await settle()

    expect(store.loadingMore()).toBe(false)
    expect(api.list).toHaveBeenCalledTimes(2)
    expect(api.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 }),
      expect.anything()
    )
    expect(store.rows().map((row) => row.id)).toEqual([1, 2, 3])
    expect(store.hasMore()).toBe(false)
  })

  it('test_a_new_filter_starts_again_from_page_one', async () => {
    const store = setup([
      page([aTransaction({ id: 1 })], 1, 2),
      page([aTransaction({ id: 2 })], 2, 2),
    ])
    await settle()
    store.loadMore()
    await settle()

    store.setAccount(1)
    await settle()

    expect(api.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, accountId: [1] }),
      expect.anything()
    )
  })

  it('test_optimistic_patch_shows_at_once_and_rolls_back_on_failure', async () => {
    const row = aTransaction({ id: 1, payee: 'Corner Grocer', amountCents: -4820 })
    const store = setup([page([row])])
    await settle()
    let reject!: (error: unknown) => void
    api.update.mockReturnValue(new Promise((_, fail) => (reject = fail)))

    const saving = store.update(row, { payee: 'Night Market', amountCents: 5000, kind: 'expense' })

    expect(store.rows()[0]).toEqual(
      expect.objectContaining({ payee: 'Night Market', amountCents: -5000 })
    )
    reject(httpError(422, { errors: [{ field: 'payee', rule: 'x', message: 'Too long' }] }))
    await expect(saving).rejects.toBeTruthy()
    expect(store.rows()[0]).toEqual(
      expect.objectContaining({ payee: 'Corner Grocer', amountCents: -4820 })
    )
  })

  it('test_a_saved_patch_reloads_the_month_it_touched', async () => {
    const row = aTransaction({ id: 1, date: '2026-10-15' })
    const store = setup([page([row])])
    await settle()
    api.update.mockResolvedValue({ ...row, date: '2026-09-30' })
    const months = TestBed.inject(MonthStore)
    const october = months.revision('2026-10' as YearMonth)
    const september = months.revision('2026-09' as YearMonth)

    await store.update(row, { date: '2026-09-30' })
    await settle()

    expect(october()).toBe(1)
    expect(september()).toBe(1)
    expect(api.list).toHaveBeenCalledTimes(2)
  })

  it('test_delete_removes_the_row_and_undo_recreates_it', async () => {
    const row = aTransaction({ id: 1, payee: 'Corner Grocer', amountCents: -4820, categoryId: 20 })
    const store = setup([page([row])])
    await settle()

    await store.remove(row)

    expect(api.remove).toHaveBeenCalledWith(1)
    const toast = TestBed.inject(ToastStore).current()
    expect(toast?.messageKey).toBe('transactions.toast.deleted')

    TestBed.inject(ToastStore).runAction()
    await settle()

    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 1,
        kind: 'expense',
        amountCents: 4820,
        payee: 'Corner Grocer',
        categoryId: 20,
        date: '2026-10-15',
        clientId: expect.any(String),
      })
    )
  })

  it('test_a_failed_delete_puts_the_row_back', async () => {
    const row = aTransaction({ id: 1 })
    const store = setup([page([row])])
    await settle()
    api.remove.mockRejectedValue(httpError(500))

    await store.remove(row)

    expect(store.rows().map((item) => item.id)).toEqual([1])
    expect(TestBed.inject(ToastStore).current()?.status).toBe('critical')
  })

  it('test_transfer_legs_are_deleted_through_the_transfer', async () => {
    const [out, incoming] = aTransferPair(9)
    const store = setup([page([out, incoming])])
    await settle()

    await store.remove(out)

    expect(transfers.remove).toHaveBeenCalledWith(9)
    expect(api.remove).not.toHaveBeenCalled()
    expect(store.rows()).toEqual([])
  })
})
