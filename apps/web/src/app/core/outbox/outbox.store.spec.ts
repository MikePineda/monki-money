import { computed, signal, type WritableSignal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { aTransaction } from '../../../testing/ledger-fixtures'
import { aUser, httpError, networkError, validationError } from '../../../testing/session-fixtures'
import type { User } from '../api/api-types'
import { SessionStore } from '../auth/session.store'
import { TransactionsApi } from '../ledger/transactions.api'
import { MonthStore } from '../month/month.store'
import { CLOCK } from '../platform/clock.token'
import { WINDOW } from '../platform/window.token'
import { ToastStore } from '../ui/toast.store'
import {
  deserialize,
  serialize,
  enqueue as enqueueEntry,
  markFailed,
  type OutboxEntry,
  type OutboxItem,
} from '../../domain/outbox'
import { OUTBOX_KEY, OutboxStore } from './outbox.store'

const NOW = new Date('2026-10-16T09:30:00.000Z')

let counter = 0

function clientId(): string {
  counter += 1
  return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`
}

function anExpense(overrides: { date?: string; amountCents?: number } = {}): OutboxItem {
  return {
    kind: 'transaction',
    payload: {
      clientId: clientId(),
      kind: 'expense',
      accountId: 1,
      date: overrides.date ?? '2026-10-16',
      amountCents: overrides.amountCents ?? 4250,
      categoryId: 10,
      payee: null,
      description: null,
      paidByUserId: 1,
      isPrivate: false,
      tags: [],
    },
  }
}

function aTransfer(date = '2026-09-30'): OutboxItem {
  return {
    kind: 'transfer',
    payload: {
      clientId: clientId(),
      fromAccountId: 1,
      toAccountId: 2,
      date,
      amountCents: 50000,
      memo: null,
    },
  }
}

/** A stored outbox with one entry the API already refused (so nothing syncs on load). */
function aStoredFailedEntry(): OutboxEntry[] {
  const entries = enqueueEntry([], anExpense(), NOW)
  return markFailed(entries, entries[0]?.id ?? '', { code: 'E_VALIDATION', message: 'No' }, false)
}

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => (resolve = done))
  return { promise, resolve }
}

describe('OutboxStore', () => {
  let api: { quick: ReturnType<typeof vi.fn>; transfer: ReturnType<typeof vi.fn> }
  let months: { invalidate: ReturnType<typeof vi.fn> }
  let user: WritableSignal<User | null>
  let clearHooks: (() => void)[]
  let logoutHooks: (() => void)[]
  let view: EventTarget & { navigator: { onLine: boolean }; localStorage: Storage }

  function setup(options: { online?: boolean; signedIn?: boolean } = {}): OutboxStore {
    api = {
      quick: vi.fn(async () => aTransaction()),
      transfer: vi.fn(async () => ({ id: 7, legs: [] })),
    }
    months = { invalidate: vi.fn() }
    user = signal(options.signedIn === false ? null : aUser({ id: 1 }))
    clearHooks = []
    logoutHooks = []
    view = Object.assign(new EventTarget(), {
      navigator: { onLine: options.online ?? true },
      localStorage: window.localStorage,
    })
    TestBed.configureTestingModule({
      providers: [
        { provide: TransactionsApi, useValue: api },
        { provide: MonthStore, useValue: months },
        { provide: WINDOW, useValue: view },
        { provide: CLOCK, useValue: () => NOW },
        {
          provide: SessionStore,
          useValue: {
            user,
            isAuthenticated: computed(() => user() !== null),
            hasHousehold: signal(true),
            isPendingDeletion: signal(false),
            onClear: (hook: () => void) => clearHooks.push(hook),
            onLogout: (hook: () => void) => logoutHooks.push(hook),
          },
        },
      ],
    })
    const store = TestBed.inject(OutboxStore)
    store.start()
    TestBed.tick()
    return store
  }

  function stored(userId = 1): OutboxEntry[] {
    return deserialize(localStorage.getItem(`${OUTBOX_KEY}${userId}`))
  }

  function goOnline(): void {
    view.navigator.onLine = true
    view.dispatchEvent(new Event('online'))
  }

  /** Lets a flush started by an event or a timer run to its end. */
  async function settle(store: OutboxStore): Promise<void> {
    await vi.waitFor(() => expect(store.isSyncing()).toBe(false))
    await Promise.resolve()
  }

  afterEach(() => {
    vi.useRealTimers()
    localStorage.clear()
  })

  describe('loading', () => {
    it('test_loads_the_signed_in_users_outbox_from_this_device', () => {
      localStorage.setItem(`${OUTBOX_KEY}1`, serialize(aStoredFailedEntry()))

      const store = setup()

      expect(store.entries()).toHaveLength(1)
      expect(store.failedCount()).toBe(1)
      expect(store.pendingCount()).toBe(0)
    })

    it('test_another_users_outbox_is_never_loaded', () => {
      localStorage.setItem(`${OUTBOX_KEY}2`, serialize(aStoredFailedEntry()))

      const store = setup()

      expect(store.entries()).toEqual([])
    })

    it('test_a_corrupt_stored_outbox_loads_empty', () => {
      localStorage.setItem(`${OUTBOX_KEY}1`, '{oops')

      expect(setup().entries()).toEqual([])
    })
  })

  describe('enqueue', () => {
    it('test_enqueue_persists_before_returning_and_counts_as_pending', () => {
      const store = setup({ online: false })
      const item = anExpense()

      store.enqueue(item)

      expect(stored().map((entry) => entry.id)).toEqual([item.payload.clientId])
      expect(store.pendingCount()).toBe(1)
      expect(store.entry(item.payload.clientId)?.status).toBe('pending')
      expect(api.quick).not.toHaveBeenCalled()
    })
  })

  describe('flush', () => {
    it('test_flush_posts_each_entry_once_in_order_with_its_client_id', async () => {
      const store = setup({ online: false })
      const expense = anExpense()
      const transfer = aTransfer()
      store.enqueue(expense)
      store.enqueue(transfer)
      const calls: string[] = []
      api.quick.mockImplementation(async (body: { clientId: string }) => {
        calls.push(`quick:${body.clientId}`)
        return aTransaction()
      })
      api.transfer.mockImplementation(async (body: { clientId: string }) => {
        calls.push(`transfer:${body.clientId}`)
        return { id: 7, legs: [] }
      })

      await store.flush()

      expect(calls).toEqual([
        `quick:${expense.payload.clientId}`,
        `transfer:${transfer.payload.clientId}`,
      ])
      expect(api.quick).toHaveBeenCalledWith(expense.payload)
      expect(api.transfer).toHaveBeenCalledWith(transfer.payload)
      expect(store.entries()).toEqual([])
      expect(localStorage.getItem(`${OUTBOX_KEY}1`)).toBeNull()
    })

    it('test_a_synced_entry_refreshes_its_month', async () => {
      const store = setup({ online: false })
      store.enqueue(anExpense({ date: '2026-10-02' }))
      store.enqueue(aTransfer('2026-09-30'))

      await store.flush()

      expect(months.invalidate).toHaveBeenCalledWith('2026-10')
      expect(months.invalidate).toHaveBeenCalledWith('2026-09')
    })

    it('test_a_batch_that_synced_says_how_many_entries', async () => {
      const store = setup({ online: false })
      store.enqueue(anExpense())
      store.enqueue(anExpense())

      await store.flush()

      expect(TestBed.inject(ToastStore).current()).toMatchObject({
        messageKey: 'outbox.toast.synced',
        params: { count: 2 },
      })
    })

    it('test_nothing_to_sync_shows_no_toast', async () => {
      const store = setup()

      await store.flush()

      expect(TestBed.inject(ToastStore).current()).toBeNull()
      expect(api.quick).not.toHaveBeenCalled()
    })

    it('test_is_syncing_while_a_request_is_in_flight', async () => {
      const store = setup({ online: false })
      store.enqueue(anExpense())
      const answer = deferred<unknown>()
      api.quick.mockReturnValueOnce(answer.promise)

      const flushing = store.flush()
      await vi.waitFor(() => expect(api.quick).toHaveBeenCalled())

      expect(store.isSyncing()).toBe(true)
      expect(store.entries()[0]?.status).toBe('syncing')
      answer.resolve(aTransaction())
      await flushing
      expect(store.isSyncing()).toBe(false)
    })

    it('test_flush_runs_once_at_a_time', async () => {
      const store = setup({ online: false })
      store.enqueue(anExpense())

      await Promise.all([store.flush(), store.flush()])

      expect(api.quick).toHaveBeenCalledTimes(1)
    })

    it('test_a_network_failure_keeps_the_entry_and_retries_after_the_backoff', async () => {
      vi.useFakeTimers()
      const store = setup({ online: false })
      store.enqueue(anExpense())
      view.navigator.onLine = true
      api.quick.mockRejectedValueOnce(networkError())

      await store.flush()

      expect(store.entries()[0]).toMatchObject({ status: 'pending', attempts: 1 })
      expect(stored()[0]?.attempts).toBe(1)
      await vi.advanceTimersByTimeAsync(999)
      expect(api.quick).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(1)
      await vi.waitFor(() => expect(store.entries()).toEqual([]))
      expect(api.quick).toHaveBeenCalledTimes(2)
      const [first, second] = api.quick.mock.calls.map(([body]) => body.clientId)
      expect(second).toBe(first)
    })

    it('test_a_retryable_failure_stops_the_batch_until_the_next_try', async () => {
      const store = setup({ online: false })
      store.enqueue(anExpense())
      store.enqueue(anExpense())
      api.quick.mockRejectedValueOnce(httpError(503))

      await store.flush()

      expect(api.quick).toHaveBeenCalledTimes(1)
      expect(store.pendingCount()).toBe(2)
    })

    it('test_a_validation_failure_marks_the_entry_failed_and_moves_on', async () => {
      const store = setup({ online: false })
      const refused = anExpense()
      store.enqueue(refused)
      store.enqueue(anExpense())
      api.quick.mockRejectedValueOnce(
        validationError({ categoryId: 'The selected category does not exist' })
      )

      await store.flush()

      expect(api.quick).toHaveBeenCalledTimes(2)
      expect(store.entries()).toHaveLength(1)
      expect(store.entries()[0]).toMatchObject({
        id: refused.payload.clientId,
        status: 'failed',
        error: { code: 'E_VALIDATION', message: 'The selected category does not exist' },
      })
      expect(store.failedCount()).toBe(1)
      expect(store.pendingCount()).toBe(0)
    })

    it('test_a_conflict_counts_as_synced', async () => {
      const store = setup({ online: false })
      store.enqueue(anExpense())
      api.quick.mockRejectedValueOnce(httpError(409, { code: 'E_ALREADY_EXISTS' }))

      await store.flush()

      expect(store.entries()).toEqual([])
    })
  })

  describe('triggers', () => {
    it('test_signing_in_flushes_what_this_device_kept', async () => {
      const entries = enqueueEntry([], anExpense(), NOW)
      localStorage.setItem(`${OUTBOX_KEY}1`, serialize(entries))

      const store = setup()
      await settle(store)

      expect(api.quick).toHaveBeenCalledWith(entries[0]?.payload)
      expect(store.entries()).toEqual([])
    })

    it('test_coming_back_online_flushes', async () => {
      const store = setup({ online: false })
      store.enqueue(anExpense())
      expect(store.isOnline()).toBe(false)

      goOnline()
      await settle(store)

      expect(store.isOnline()).toBe(true)
      expect(api.quick).toHaveBeenCalledTimes(1)
      expect(store.entries()).toEqual([])
    })

    it('test_returning_to_the_app_flushes', async () => {
      const store = setup({ online: false })
      store.enqueue(anExpense())
      view.navigator.onLine = true

      document.dispatchEvent(new Event('visibilitychange'))
      await settle(store)

      expect(api.quick).toHaveBeenCalledTimes(1)
    })

    it('test_while_offline_no_timer_retries_until_the_connection_is_back', async () => {
      vi.useFakeTimers()
      const store = setup({ online: false })
      store.enqueue(anExpense())

      await vi.advanceTimersByTimeAsync(120_000)

      expect(api.quick).not.toHaveBeenCalled()
      expect(store.pendingCount()).toBe(1)
    })
  })

  describe('session', () => {
    it('test_never_flushes_while_logged_out', async () => {
      localStorage.setItem(`${OUTBOX_KEY}1`, serialize(enqueueEntry([], anExpense(), NOW)))
      const store = setup({ signedIn: false })

      await store.flush()
      goOnline()
      await Promise.resolve()

      expect(api.quick).not.toHaveBeenCalled()
      expect(store.entries()).toEqual([])
    })

    it('test_logout_forgets_the_outbox_on_this_device', () => {
      const store = setup({ online: false })
      store.enqueue(anExpense())

      for (const hook of logoutHooks) hook()
      for (const hook of clearHooks) hook()

      expect(localStorage.getItem(`${OUTBOX_KEY}1`)).toBeNull()
      expect(store.entries()).toEqual([])
    })

    it('test_an_expired_session_keeps_the_outbox_for_the_next_login', () => {
      const store = setup({ online: false })
      const item = anExpense()
      store.enqueue(item)

      for (const hook of clearHooks) hook()
      user.set(null)
      TestBed.tick()
      expect(store.entries()).toEqual([])

      user.set(aUser({ id: 1 }))
      TestBed.tick()
      expect(store.entries().map((entry) => entry.id)).toEqual([item.payload.clientId])
    })
  })

  describe('acting on entries', () => {
    it('test_retry_puts_failed_entries_back_and_syncs_them', async () => {
      localStorage.setItem(`${OUTBOX_KEY}1`, serialize(aStoredFailedEntry()))
      const store = setup()

      await store.retry()

      expect(api.quick).toHaveBeenCalledTimes(1)
      expect(store.entries()).toEqual([])
    })

    it('test_discard_drops_an_entry_without_calling_the_api', () => {
      const store = setup({ online: false })
      const item = anExpense()
      store.enqueue(item)

      store.discard(item.payload.clientId)

      expect(store.entries()).toEqual([])
      expect(localStorage.getItem(`${OUTBOX_KEY}1`)).toBeNull()
      expect(api.quick).not.toHaveBeenCalled()
    })

    it('test_an_entry_being_edited_waits_and_its_replacement_keeps_the_client_id', async () => {
      const store = setup({ online: false })
      const item = anExpense()
      const id = item.payload.clientId
      store.enqueue(item)
      store.hold(id)

      await store.flush()
      expect(api.quick).not.toHaveBeenCalled()

      await store.replace(id, anExpense({ amountCents: 990 }))

      expect(api.quick).toHaveBeenCalledTimes(1)
      expect(api.quick.mock.calls[0]?.[0]).toMatchObject({ clientId: id, amountCents: 990 })
      expect(store.entries()).toEqual([])
    })

    it('test_releasing_an_entry_without_changes_lets_it_sync', async () => {
      const store = setup({ online: false })
      const item = anExpense()
      store.enqueue(item)
      store.hold(item.payload.clientId)

      await store.release(item.payload.clientId)

      expect(api.quick).toHaveBeenCalledTimes(1)
    })
  })
})
