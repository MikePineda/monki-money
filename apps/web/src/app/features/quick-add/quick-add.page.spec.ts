import { Component, signal, type WritableSignal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { Router, provideRouter, withComponentInputBinding } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { i18nTesting, i18nTestingProviders } from '../../../testing/i18n-testing'
import { tagsStoreStub } from '../../../testing/tag-fixtures'
import { aCategoryTree, aTransaction } from '../../../testing/ledger-fixtures'
import {
  anAccount,
  aSessionStub,
  httpError,
  networkError,
  validationError,
} from '../../../testing/session-fixtures'
import type { TransactionSuggestions } from '@monkimoney/shared'
import type { Transaction } from '../../core/api/api-types'
import { SessionStore } from '../../core/auth/session.store'
import { AccountsApi } from '../../core/household/accounts.api'
import { CategoriesApi } from '../../core/household/categories.api'
import {
  TransactionsApi,
  type QuickEntryInput,
  type TransferInput,
} from '../../core/ledger/transactions.api'
import { MonthStore } from '../../core/month/month.store'
import { OutboxStore } from '../../core/outbox/outbox.store'
import { HOUSEHOLD_TIME_ZONE } from '../../core/platform/time-zone.token'
import { todayIn } from '../../domain/month'
import { enqueue, type OutboxEntry, type OutboxItem } from '../../domain/outbox'
import { AmountKeypadHarness } from '../../shared/ui/amount-keypad/amount-keypad.harness'
import { APP_LOCALE } from '../../shared/ui/app-locale.token'
import { SegmentedControlHarness } from '../../shared/ui/segmented-control/segmented-control.harness'
import { QuickAddStore } from './data-access/quick-add.store'
import QuickAddPage from './quick-add.page'

@Component({ template: '<p data-testid="month.page">Month</p>' })
class MonthStub {}

const TZ = 'Australia/Brisbane'
const NOW = new Date('2026-10-16T09:30:00.000Z')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('QuickAddPage', () => {
  let api: {
    list: ReturnType<typeof vi.fn>
    suggestions: ReturnType<typeof vi.fn>
    quick: ReturnType<typeof vi.fn<(body: QuickEntryInput) => Promise<Transaction>>>
    transfer: ReturnType<typeof vi.fn<(body: TransferInput) => Promise<unknown>>>
    remove: ReturnType<typeof vi.fn>
    removeTransfer: ReturnType<typeof vi.fn>
  }
  let months: { invalidate: ReturnType<typeof vi.fn> }
  let outbox: {
    entries: WritableSignal<OutboxEntry[]>
    isPersisted: WritableSignal<boolean>
    enqueue: ReturnType<typeof vi.fn<(item: OutboxItem) => void>>
    flush: ReturnType<typeof vi.fn>
    entry: ReturnType<typeof vi.fn<(id: string) => OutboxEntry | null>>
    hold: ReturnType<typeof vi.fn>
    release: ReturnType<typeof vi.fn>
    replace: ReturnType<typeof vi.fn<(id: string, item: OutboxItem) => Promise<void>>>
    undo: ReturnType<typeof vi.fn<(id: string) => Promise<'removed' | 'missing'>>>
  }
  /** Entries the fake outbox holds (for editing a queued entry). */
  let queued: OutboxEntry[] = []

  /** What the server ranks for quick add (`GET /transactions/suggestions`); nothing by default. */
  function someSuggestions(
    overrides: Partial<TransactionSuggestions> = {}
  ): TransactionSuggestions {
    return {
      asOf: todayIn(TZ),
      categories: { expense: [], income: [] },
      payees: { expense: [], income: [] },
      routes: [],
      lastAccountId: null,
      ...overrides,
    }
  }

  async function open(
    url = '/add',
    suggestions: TransactionSuggestions = someSuggestions(),
    options: { suggestionsFail?: boolean } = {}
  ) {
    api = {
      list: vi.fn(async () => []),
      suggestions: vi.fn(async () => {
        if (options.suggestionsFail) {
          throw networkError()
        }
        return suggestions
      }),
      quick: vi.fn(async (body: QuickEntryInput) =>
        aTransaction({
          id: 501,
          accountId: body.accountId ?? 1,
          amountCents: -(body.amountCents ?? 0),
          date: body.date ?? todayIn(TZ),
        })
      ),
      transfer: vi.fn(async (body: TransferInput) => ({
        id: 77,
        date: body.date,
        legs: [
          aTransaction({ kind: 'transfer', transferId: 77, accountId: body.fromAccountId }),
          aTransaction({ kind: 'transfer', transferId: 77, accountId: body.toAccountId }),
        ],
      })),
      remove: vi.fn(async () => undefined),
      removeTransfer: vi.fn(async () => undefined),
    }
    months = { invalidate: vi.fn() }
    const entries = signal<OutboxEntry[]>(queued)
    outbox = {
      entries,
      isPersisted: signal(true),
      // Like the real one: the entry is in the outbox (and its signal) when this returns.
      enqueue: vi.fn((item: OutboxItem) => entries.update((list) => enqueue(list, item, NOW))),
      flush: vi.fn(async () => undefined),
      entry: vi.fn((id: string) => entries().find((entry) => entry.id === id) ?? null),
      hold: vi.fn(),
      release: vi.fn(async () => undefined),
      replace: vi.fn(async () => undefined),
      undo: vi.fn(async (id: string) => {
        entries.update((list) => list.filter((entry) => entry.id !== id))
        return 'removed' as const
      }),
    }
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [
        i18nTestingProviders(),
        provideRouter(
          [
            { path: 'add', component: QuickAddPage },
            { path: 'month', component: MonthStub },
          ],
          withComponentInputBinding()
        ),
        { provide: TransactionsApi, useValue: api },
        { provide: MonthStore, useValue: months },
        tagsStoreStub(),
        { provide: OutboxStore, useValue: outbox },
        {
          provide: AccountsApi,
          useValue: {
            list: async () => [
              anAccount({ id: 1, name: 'Everyday' }),
              anAccount({ id: 2, name: 'Savings', kind: 'savings' }),
            ],
          },
        },
        { provide: CategoriesApi, useValue: { tree: async () => aCategoryTree() } },
        { provide: SessionStore, useValue: aSessionStub() },
        { provide: HOUSEHOLD_TIME_ZONE, useValue: () => TZ },
        { provide: APP_LOCALE, useValue: signal('en-AU') },
      ],
    })
    const harness = await RouterTestingHarness.create()
    await harness.navigateByUrl(url)
    const root = harness.fixture.nativeElement as HTMLElement
    await vi.waitFor(() => expect(byTestId(root, 'quickAdd.save').textContent).toContain('Save'))
    await vi.waitFor(() =>
      expect(root.querySelector('app-transaction-form, app-transfer-form')).not.toBeNull()
    )
    await harness.fixture.whenStable()
    const loader = TestbedHarnessEnvironment.loader(harness.fixture)
    return { harness, root, loader }
  }

  function byTestId(root: ParentNode, id: string): HTMLElement {
    const element = root.querySelector<HTMLElement>(`[data-testid="${id}"]`)
    if (!element) {
      throw new Error(`No element with data-testid="${id}"`)
    }
    return element
  }

  function text(root: ParentNode, id: string): string {
    return byTestId(root, id).textContent?.replace(/\s+/g, ' ').trim() ?? ''
  }

  /** The hero amount as shown (without its screen-reader label). */
  function heroText(root: ParentNode): string {
    return (
      root
        .querySelector('[data-testid="transactions.form.amount"] app-amount-display')
        ?.textContent?.replace(/\s+/g, ' ')
        .trim() ?? ''
    )
  }

  async function settle(harness: RouterTestingHarness): Promise<void> {
    await harness.fixture.whenStable()
  }

  afterEach(() => {
    localStorage.clear()
    queued = []
    vi.restoreAllMocks()
  })

  function goOffline(): void {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)
  }

  function toastText(root: ParentNode): string {
    return root.querySelector('app-toast')?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  }

  function toastButtons(root: ParentNode): string[] {
    return [...(root.querySelector('app-toast')?.querySelectorAll('button') ?? [])].map(
      (button) => button.textContent?.trim() ?? ''
    )
  }

  it('test_opens_with_expense_the_stored_account_you_and_today', async () => {
    localStorage.setItem('qa:account:1', '2')
    const { root, loader } = await open()

    expect(await (await loader.getHarness(SegmentedControlHarness)).getSelected()).toBe('Expense')
    expect(text(root, 'transactions.form.account')).toBe('Savings')
    expect(text(root, 'transactions.form.person')).toBe('You')
    expect(text(root, 'quickAdd.dateChip')).toMatch(/^Today · [A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}$/)
    expect(heroText(root)).toBe('$0.00')
  })

  it('test_the_camera_button_in_the_header_opens_the_receipt_scanner', async () => {
    const { root } = await open()

    const scan = byTestId(root, 'quickAdd.scan')
    expect(scan.getAttribute('href')).toBe('/scan')
    expect(scan.getAttribute('aria-label')).toBe('Scan a receipt')
  })

  it('test_without_a_stored_account_the_last_one_the_server_saw_picks_it', async () => {
    const { root } = await open('/add', someSuggestions({ lastAccountId: 2 }))

    expect(text(root, 'transactions.form.account')).toBe('Savings')
  })

  it('test_the_server_ranks_the_tiles_payees_and_routes_without_reading_the_ledger', async () => {
    const { root, harness } = await open(
      '/add',
      someSuggestions({
        // Groceries (20) is last in the default order.
        categories: { expense: [{ categoryId: 20, score: 3, lastDate: todayIn(TZ) }], income: [] },
        payees: { expense: [{ payee: 'Bakery', score: 2, lastDate: todayIn(TZ) }], income: [] },
        routes: [{ fromAccountId: 2, toAccountId: 1, score: 1, lastDate: todayIn(TZ) }],
      })
    )
    const store = harness.routeDebugElement?.injector.get(QuickAddStore)

    const tiles = [
      ...root.querySelectorAll('[data-testid="transactions.form.categoryGrid"] [data-category]'),
    ]
    expect(tiles[0]?.getAttribute('data-category')).toBe('20')
    expect(store?.payees()).toEqual(['Bakery'])
    expect(store?.presets()).toEqual([{ fromAccountId: 2, toAccountId: 1 }])
    expect(api.suggestions).toHaveBeenCalledTimes(1)
    expect(api.list).not.toHaveBeenCalled()
  })

  it('test_the_manifest_type_opens_on_that_kind', async () => {
    const { loader, root } = await open('/add?type=income')

    expect(await (await loader.getHarness(SegmentedControlHarness)).getSelected()).toBe('Income')
    expect(text(root, 'quickAdd.title')).toBe('Add income')
  })

  it('test_offline_it_opens_with_the_loaded_accounts_even_without_suggestions', async () => {
    const { root } = await open('/add', someSuggestions(), { suggestionsFail: true })

    expect(text(root, 'transactions.form.account')).toBe('Everyday')
    expect(root.querySelector('[data-testid="quickAdd.loadError"]')).toBeNull()
  })

  it('test_save_is_disabled_at_zero', async () => {
    const { root } = await open()

    expect((byTestId(root, 'quickAdd.save') as HTMLButtonElement).disabled).toBe(true)
  })

  it('test_three_taps_save_an_expense_with_the_defaults', async () => {
    const { root, loader, harness } = await open()
    const keypad = await loader.getHarness(AmountKeypadHarness)

    await keypad.press('5', '00')
    expect(text(root, 'quickAdd.save')).toBe('Save −$5.00')
    byTestId(root, 'quickAdd.save').click()
    await settle(harness)

    expect(api.quick).toHaveBeenCalledTimes(1)
    const body = api.quick.mock.calls[0]?.[0]
    expect(body).toEqual({
      clientId: expect.stringMatching(UUID),
      kind: 'expense',
      amountCents: 500,
      accountId: 1,
      date: todayIn(TZ),
      categoryId: null,
      payee: null,
      description: null,
      paidByUserId: 1,
      isPrivate: false,
      tags: [],
    })
  })

  it('test_a_category_tile_goes_with_the_entry_and_a_second_tap_clears_it', async () => {
    const { root, loader, harness } = await open()
    const tile = () => root.querySelector<HTMLElement>('[data-category="10"]') as HTMLElement

    tile().click()
    await settle(harness)
    expect(tile().getAttribute('aria-pressed')).toBe('true')
    await (await loader.getHarness(AmountKeypadHarness)).press('9')
    byTestId(root, 'quickAdd.save').click()
    await settle(harness)

    expect(api.quick.mock.calls[0]?.[0]).toMatchObject({ categoryId: 10, amountCents: 9 })
  })

  it('test_after_saving_it_stays_on_add_clears_and_offers_undo', async () => {
    const { root, loader, harness } = await open()
    await (await loader.getHarness(AmountKeypadHarness)).press('4', '2', '5', '0')
    byTestId(root, 'quickAdd.save').click()
    await settle(harness)

    expect(TestBed.inject(Router).url).toBe('/add')
    expect(heroText(root)).toBe('$0.00')
    expect(localStorage.getItem('qa:account:1')).toBe('1')
    expect(months.invalidate).toHaveBeenCalledWith(todayIn(TZ).slice(0, 7))
    const toast = root.querySelector('app-toast') as HTMLElement
    expect(toast.textContent).toContain('Saved')

    const undo = [...toast.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Undo')
    ) as HTMLButtonElement
    undo.click()
    await settle(harness)
    expect(api.remove).toHaveBeenCalledWith(501)
  })

  it('test_typing_the_next_amount_dismisses_the_saved_toast', async () => {
    const { root, loader, harness } = await open()
    const keypad = await loader.getHarness(AmountKeypadHarness)
    await keypad.press('1', '00')
    byTestId(root, 'quickAdd.save').click()
    await settle(harness)
    expect(root.querySelector('app-toast')).not.toBeNull()

    await keypad.press('2')

    expect(root.querySelector('app-toast')).toBeNull()
  })

  it('test_a_successful_save_also_syncs_the_outbox', async () => {
    const { root, loader, harness } = await open()
    await (await loader.getHarness(AmountKeypadHarness)).press('1', '00')
    byTestId(root, 'quickAdd.save').click()
    await settle(harness)

    expect(outbox.flush).toHaveBeenCalled()
    expect(outbox.enqueue).not.toHaveBeenCalled()
  })

  it('test_offline_the_entry_is_queued_without_calling_the_api', async () => {
    const { root, loader, harness } = await open()
    goOffline()
    await (await loader.getHarness(AmountKeypadHarness)).press('4', '2', '5', '0')
    byTestId(root, 'quickAdd.save').click()
    await settle(harness)

    expect(api.quick).not.toHaveBeenCalled()
    expect(outbox.enqueue).toHaveBeenCalledTimes(1)
    expect(outbox.enqueue.mock.calls[0]?.[0]).toEqual({
      kind: 'transaction',
      payload: {
        clientId: expect.stringMatching(UUID),
        kind: 'expense',
        amountCents: 4250,
        accountId: 1,
        date: todayIn(TZ),
        categoryId: null,
        payee: null,
        description: null,
        paidByUserId: 1,
        isPrivate: false,
        tags: [],
      },
    })
    expect(TestBed.inject(Router).url).toBe('/add')
    expect(heroText(root)).toBe('$0.00')
    expect(toastText(root)).toContain('Saved offline · will sync')
    expect(toastButtons(root)).toContain('Undo')
    expect(localStorage.getItem('qa:account:1')).toBe('1')
  })

  /**
   * Saves $1.00 offline and taps "Undo" on the "Saved offline" toast; the
   * outbox's undo answers `answer` when given (else it drops the entry).
   */
  async function queueAndUndo(answer?: () => Promise<'removed' | 'missing'>) {
    const { root, loader, harness } = await open()
    if (answer) {
      outbox.undo.mockImplementation(answer)
    }
    goOffline()
    await (await loader.getHarness(AmountKeypadHarness)).press('1', '00')
    byTestId(root, 'quickAdd.save').click()
    await settle(harness)
    const clientId = outbox.enqueue.mock.calls[0]?.[0].payload.clientId
    const undo = [...(root.querySelector('app-toast')?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent?.includes('Undo')
    )
    undo?.click()
    await settle(harness)
    return { root, clientId }
  }

  it('test_undo_on_the_saved_offline_toast_removes_the_queued_entry', async () => {
    const { root, clientId } = await queueAndUndo()

    expect(outbox.undo).toHaveBeenCalledWith(clientId)
    await vi.waitFor(() => expect(toastText(root)).toBe('Removed'))
    expect(outbox.entries()).toEqual([])
    expect(api.remove).not.toHaveBeenCalled()
  })

  it('test_undo_of_an_entry_another_tab_already_synced_says_so', async () => {
    const { root } = await queueAndUndo(async () => 'missing')

    await vi.waitFor(() =>
      expect(toastText(root)).toBe('It already synced. Delete it from Transactions instead.')
    )
  })

  it('test_an_undo_that_cannot_reach_the_server_says_why', async () => {
    const { root } = await queueAndUndo(async () => {
      throw networkError()
    })

    await vi.waitFor(() => expect(toastText(root)).toContain('Can’t reach monkimoney'))
  })

  it('test_an_entry_this_device_could_not_store_says_to_keep_the_app_open', async () => {
    const { root, loader, harness } = await open()
    outbox.enqueue.mockImplementationOnce((item: OutboxItem) => {
      outbox.entries.update((list) => enqueue(list, item, NOW))
      outbox.isPersisted.set(false)
    })
    goOffline()
    await (await loader.getHarness(AmountKeypadHarness)).press('1', '00')
    byTestId(root, 'quickAdd.save').click()
    await settle(harness)

    expect(toastText(root)).toContain('Saved offline · keep the app open until it syncs')
    expect(toastButtons(root)).toContain('Undo')
  })

  it('test_a_queued_expense_ranks_its_category_and_payee_before_it_syncs', async () => {
    // Groceries (20) is last in the default order; one queued use puts it first.
    queued = enqueue(
      [],
      {
        kind: 'transaction',
        payload: {
          clientId: '00000000-0000-4000-8000-000000000045',
          kind: 'expense',
          accountId: 1,
          date: todayIn(TZ),
          amountCents: 850,
          categoryId: 20,
          payee: 'Bakery',
          description: null,
          paidByUserId: 1,
          isPrivate: false,
          tags: [],
        },
      },
      NOW
    )
    const { root, harness } = await open('/add', someSuggestions(), { suggestionsFail: true })

    const tiles = [
      ...root.querySelectorAll('[data-testid="transactions.form.categoryGrid"] [data-category]'),
    ]
    expect(tiles[0]?.getAttribute('data-category')).toBe('20')
    expect(harness.routeDebugElement?.injector.get(QuickAddStore).payees()).toEqual(['Bakery'])
  })

  it('test_a_queued_entry_adds_to_the_server_ranking', async () => {
    queued = enqueue(
      [],
      {
        kind: 'transaction',
        payload: {
          clientId: '00000000-0000-4000-8000-000000000046',
          kind: 'expense',
          accountId: 1,
          date: todayIn(TZ),
          amountCents: 850,
          categoryId: 20,
          payee: 'Bakery',
          description: null,
          paidByUserId: 1,
          isPrivate: false,
          tags: [],
        },
      },
      NOW
    )
    const { harness } = await open(
      '/add',
      someSuggestions({
        categories: {
          expense: [{ categoryId: 11, score: 0.5, lastDate: '2026-09-15' }],
          income: [],
        },
        payees: { expense: [{ payee: 'Kmart', score: 0.5, lastDate: '2026-09-15' }], income: [] },
      })
    )
    const store = harness.routeDebugElement?.injector.get(QuickAddStore)

    expect(
      store
        ?.categoryTiles()
        .map((tile) => tile.category.id)
        .slice(0, 2)
    ).toEqual([20, 11])
    expect(store?.payees()).toEqual(['Bakery', 'Kmart'])
  })

  it('test_an_expense_queued_on_this_screen_feeds_the_ranking_at_once', async () => {
    const { root, loader, harness } = await open()
    const store = harness.routeDebugElement?.injector.get(QuickAddStore)
    goOffline()
    store?.entry.update((entry) => ({ ...entry, categoryId: 20, payee: 'Bakery' }))
    await (await loader.getHarness(AmountKeypadHarness)).press('8', '5', '0')
    byTestId(root, 'quickAdd.save').click()
    await settle(harness)

    expect(store?.payees()).toEqual(['Bakery'])
    expect(store?.categoryTiles()[0]?.category.id).toBe(20)
  })

  it('test_a_network_error_queues_the_entry_with_the_client_id_it_tried', async () => {
    const { root, loader, harness } = await open()
    api.quick.mockRejectedValueOnce(networkError())
    await (await loader.getHarness(AmountKeypadHarness)).press('1', '00')
    byTestId(root, 'quickAdd.save').click()
    await settle(harness)

    const tried = api.quick.mock.calls[0]?.[0].clientId
    expect(outbox.enqueue.mock.calls[0]?.[0].payload.clientId).toBe(tried)
    expect(heroText(root)).toBe('$0.00')
    expect(toastText(root)).toContain('Saved offline · will sync')
    expect(root.querySelector('app-banner')).toBeNull()
  })

  it('test_a_server_error_queues_the_entry_too', async () => {
    const { root, loader, harness } = await open()
    api.quick.mockRejectedValueOnce(httpError(503))
    await (await loader.getHarness(AmountKeypadHarness)).press('1', '00')
    byTestId(root, 'quickAdd.save').click()
    await settle(harness)

    expect(outbox.enqueue).toHaveBeenCalledTimes(1)
  })

  it('test_a_queued_transfer_keeps_both_accounts', async () => {
    const { root, loader, harness } = await open()
    goOffline()
    await (await loader.getHarness(SegmentedControlHarness)).select('Transfer')
    await (await loader.getHarness(AmountKeypadHarness)).press('2', '00')
    byTestId(root, 'quickAdd.save').click()
    await settle(harness)

    expect(api.transfer).not.toHaveBeenCalled()
    expect(outbox.enqueue.mock.calls[0]?.[0]).toEqual({
      kind: 'transfer',
      payload: {
        clientId: expect.stringMatching(UUID),
        fromAccountId: 1,
        toAccountId: 2,
        date: todayIn(TZ),
        amountCents: 200,
        memo: null,
      },
    })
  })

  it('test_a_refusal_that_is_not_about_a_field_keeps_the_draft_and_says_so', async () => {
    const { root, loader, harness } = await open()
    api.quick.mockRejectedValueOnce(httpError(403, { code: 'E_HOUSEHOLD_SUSPENDED' }))
    await (await loader.getHarness(AmountKeypadHarness)).press('1', '00')
    byTestId(root, 'quickAdd.save').click()
    await settle(harness)

    expect(outbox.enqueue).not.toHaveBeenCalled()
    expect(heroText(root)).toBe('$1.00')
    expect(toastText(root)).toContain('Something went wrong')
  })

  it('test_editing_a_queued_entry_opens_it_prefilled_and_saving_replaces_it', async () => {
    const item: OutboxItem = {
      kind: 'transaction',
      payload: {
        clientId: '00000000-0000-4000-8000-000000000042',
        kind: 'expense',
        accountId: 2,
        date: todayIn(TZ),
        amountCents: 1999,
        categoryId: 10,
        payee: 'Corner Shop',
        description: null,
        paidByUserId: 1,
        isPrivate: false,
        tags: [],
      },
    }
    queued = enqueue([], item, new Date())
    const id = item.payload.clientId
    const { root, harness } = await open(`/add?outbox=${id}`)

    expect(outbox.hold).toHaveBeenCalledWith(id)
    expect(heroText(root)).toBe('$19.99')
    expect(text(root, 'transactions.form.account')).toBe('Savings')
    expect(root.querySelector('[data-category="10"]')?.getAttribute('aria-pressed')).toBe('true')

    byTestId(root, 'quickAdd.save').click()
    await settle(harness)

    expect(api.quick).not.toHaveBeenCalled()
    expect(outbox.enqueue).not.toHaveBeenCalled()
    expect(outbox.replace).toHaveBeenCalledWith(id, { kind: 'transaction', payload: item.payload })
    expect(TestBed.inject(Router).url).toBe('/month')
  })

  it('test_editing_a_queued_transfer_opens_the_transfer_form', async () => {
    const item: OutboxItem = {
      kind: 'transfer',
      payload: {
        clientId: '00000000-0000-4000-8000-000000000043',
        fromAccountId: 2,
        toAccountId: 1,
        date: todayIn(TZ),
        amountCents: 700,
        memo: 'Back',
      },
    }
    queued = enqueue([], item, new Date())
    const { root, loader } = await open(`/add?outbox=${item.payload.clientId}`)

    expect(await (await loader.getHarness(SegmentedControlHarness)).getSelected()).toBe('Transfer')
    expect(text(root, 'transactions.transfer.from')).toBe('Savings')
    expect(text(root, 'transactions.transfer.to')).toBe('Everyday')
    expect(text(root, 'quickAdd.save')).toBe('Save $7.00')
  })

  it('test_leaving_an_edit_without_saving_releases_the_entry', async () => {
    const item: OutboxItem = {
      kind: 'transfer',
      payload: {
        clientId: '00000000-0000-4000-8000-000000000044',
        fromAccountId: 1,
        toAccountId: 2,
        date: todayIn(TZ),
        amountCents: 700,
        memo: null,
      },
    }
    queued = enqueue([], item, new Date())
    const { root, harness } = await open(`/add?outbox=${item.payload.clientId}`)

    byTestId(root, 'quickAdd.done').click()
    await settle(harness)

    expect(outbox.release).toHaveBeenCalledWith(item.payload.clientId)
    expect(outbox.replace).not.toHaveBeenCalled()
  })

  it('test_an_unknown_queued_entry_opens_a_blank_quick_add', async () => {
    const { root } = await open('/add?outbox=missing')

    expect(outbox.hold).not.toHaveBeenCalled()
    expect(heroText(root)).toBe('$0.00')
  })

  it('test_a_new_entry_gets_a_new_client_id', async () => {
    const { root, loader, harness } = await open()
    const keypad = await loader.getHarness(AmountKeypadHarness)
    await keypad.press('1', '00')
    byTestId(root, 'quickAdd.save').click()
    await settle(harness)
    await keypad.press('1', '00')
    byTestId(root, 'quickAdd.save').click()
    await settle(harness)

    const [first, second] = api.quick.mock.calls.map(([body]) => body.clientId)
    expect(second).not.toBe(first)
  })

  it('test_validation_errors_show_next_to_the_field', async () => {
    const { root, loader, harness } = await open()
    api.quick.mockRejectedValueOnce(validationError({ amountCents: 'The amount is too large.' }))
    await (await loader.getHarness(AmountKeypadHarness)).press('9')
    byTestId(root, 'quickAdd.save').click()
    await settle(harness)

    expect(
      root.querySelector('[data-testid="transactions.form.amountError"]')?.textContent
    ).toContain('The amount is too large.')
    expect(outbox.enqueue).not.toHaveBeenCalled()
    expect(heroText(root)).toBe('$0.09')
  })

  it('test_a_transfer_needs_two_different_accounts', async () => {
    const { root, loader, harness } = await open()
    await (await loader.getHarness(SegmentedControlHarness)).select('Transfer')
    await (await loader.getHarness(AmountKeypadHarness)).press('5', '00')

    expect(text(root, 'transactions.transfer.from')).toBe('Everyday')
    expect(text(root, 'transactions.transfer.to')).toBe('Savings')
    expect((byTestId(root, 'quickAdd.save') as HTMLButtonElement).disabled).toBe(false)

    byTestId(root, 'transactions.transfer.to').click()
    await settle(harness)
    const everyday = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((option) =>
      option.textContent?.includes('Everyday')
    ) as HTMLElement
    everyday.click()
    await settle(harness)

    expect(text(root, 'transactions.transfer.to')).toBe('Everyday')
    expect(text(root, 'transactions.transfer.accountError')).toBe('Choose two different accounts.')
    expect((byTestId(root, 'quickAdd.save') as HTMLButtonElement).disabled).toBe(true)
  })

  it('test_a_transfer_is_saved_through_the_transfers_endpoint', async () => {
    const { root, loader, harness } = await open()
    await (await loader.getHarness(SegmentedControlHarness)).select('Transfer')
    await (await loader.getHarness(AmountKeypadHarness)).press('2', '00')
    expect(text(root, 'quickAdd.save')).toBe('Save $2.00')
    byTestId(root, 'quickAdd.save').click()
    await settle(harness)

    expect(api.quick).not.toHaveBeenCalled()
    expect(api.transfer.mock.calls[0]?.[0]).toEqual({
      clientId: expect.stringMatching(UUID),
      fromAccountId: 1,
      toAccountId: 2,
      date: todayIn(TZ),
      amountCents: 200,
      memo: null,
    })
  })

  it('test_done_without_history_returns_to_the_month', async () => {
    const { root, harness } = await open()

    byTestId(root, 'quickAdd.done').click()
    await settle(harness)

    expect(TestBed.inject(Router).url).toBe('/month')
  })
})
