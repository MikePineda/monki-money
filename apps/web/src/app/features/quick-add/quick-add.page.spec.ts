import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { Router, provideRouter, withComponentInputBinding } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { i18nTesting, i18nTestingProviders } from '../../../testing/i18n-testing'
import { aCategoryTree, aTransaction } from '../../../testing/ledger-fixtures'
import {
  aMember,
  aUser,
  anAccount,
  networkError,
  validationError,
} from '../../../testing/session-fixtures'
import type { Transaction } from '../../core/api/api-types'
import { SessionStore } from '../../core/auth/session.store'
import { AccountsApi } from '../../core/household/accounts.api'
import { CategoriesApi } from '../../core/household/categories.api'
import { HouseholdApi } from '../../core/household/household.api'
import {
  TransactionsApi,
  type QuickEntryInput,
  type TransferInput,
} from '../../core/ledger/transactions.api'
import { MonthStore } from '../../core/month/month.store'
import { HOUSEHOLD_TIME_ZONE } from '../../core/platform/time-zone.token'
import { todayIn } from '../../domain/month'
import { AmountKeypadHarness } from '../../shared/ui/amount-keypad/amount-keypad.harness'
import { APP_LOCALE } from '../../shared/ui/app-locale.token'
import { SegmentedControlHarness } from '../../shared/ui/segmented-control/segmented-control.harness'
import QuickAddPage from './quick-add.page'

@Component({ template: '<p data-testid="month.page">Month</p>' })
class MonthStub {}

const TZ = 'Australia/Brisbane'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('QuickAddPage', () => {
  let api: {
    list: ReturnType<typeof vi.fn>
    quick: ReturnType<typeof vi.fn<(body: QuickEntryInput) => Promise<Transaction>>>
    transfer: ReturnType<typeof vi.fn<(body: TransferInput) => Promise<unknown>>>
    remove: ReturnType<typeof vi.fn>
    removeTransfer: ReturnType<typeof vi.fn>
  }
  let months: { invalidate: ReturnType<typeof vi.fn> }

  async function open(url = '/add', recent: Transaction[] = []) {
    api = {
      list: vi.fn(async () => recent),
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
        {
          provide: HouseholdApi,
          useValue: {
            members: async () => [
              aMember({ userId: 1, fullName: 'Sam Rivera' }),
              aMember({ id: 101, userId: 2, fullName: 'Alex Chen', role: 'member' }),
            ],
          },
        },
        {
          provide: SessionStore,
          useValue: { user: signal(aUser({ id: 1 })), onClear: () => undefined },
        },
        { provide: HOUSEHOLD_TIME_ZONE, useValue: () => TZ },
        { provide: APP_LOCALE, useValue: signal('en-AU') },
      ],
    })
    const harness = await RouterTestingHarness.create()
    await harness.navigateByUrl(url)
    const root = harness.fixture.nativeElement as HTMLElement
    await vi.waitFor(() => expect(byTestId(root, 'quickAdd.save').textContent).toContain('Save'))
    await vi.waitFor(() => expect(root.querySelector('app-transaction-form')).not.toBeNull())
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

  async function settle(harness: RouterTestingHarness): Promise<void> {
    await harness.fixture.whenStable()
  }

  afterEach(() => localStorage.clear())

  it('test_opens_with_expense_the_stored_account_you_and_today', async () => {
    localStorage.setItem('qa:account:1', '2')
    const { root, loader } = await open()

    expect(await (await loader.getHarness(SegmentedControlHarness)).getSelected()).toBe('Expense')
    expect(text(root, 'quickAdd.account')).toBe('Savings')
    expect(text(root, 'quickAdd.who')).toBe('You')
    expect(text(root, 'quickAdd.dateChip')).toMatch(/^Today · [A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}$/)
    expect(text(root, 'quickAdd.amount')).toBe('$0.00')
  })

  it('test_without_a_stored_account_the_latest_own_entry_picks_it', async () => {
    const { root } = await open('/add', [aTransaction({ accountId: 2, createdByUserId: 1 })])

    expect(text(root, 'quickAdd.account')).toBe('Savings')
  })

  it('test_the_manifest_type_opens_on_that_kind', async () => {
    const { loader, root } = await open('/add?type=income')

    expect(await (await loader.getHarness(SegmentedControlHarness)).getSelected()).toBe('Income')
    expect(text(root, 'quickAdd.title')).toBe('Add income')
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
    expect(text(root, 'quickAdd.amount')).toBe('$0.00')
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

  it('test_a_retry_after_a_network_error_reuses_the_client_id', async () => {
    const { root, loader, harness } = await open()
    api.quick.mockRejectedValueOnce(networkError())
    await (await loader.getHarness(AmountKeypadHarness)).press('1', '00')
    byTestId(root, 'quickAdd.save').click()
    await settle(harness)

    expect(text(root, 'quickAdd.error')).toContain('Can’t reach monkimoney')
    expect(text(root, 'quickAdd.amount')).toBe('$1.00')
    const retry = byTestId(root, 'quickAdd.error').querySelector('button') as HTMLButtonElement
    retry.click()
    await settle(harness)

    expect(api.quick).toHaveBeenCalledTimes(2)
    const [first, second] = api.quick.mock.calls.map(([body]) => body.clientId)
    expect(second).toBe(first)
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

    expect(root.querySelector('app-field-error')?.textContent).toContain('The amount is too large.')
    expect(root.querySelector('[data-testid="quickAdd.error"]')).toBeNull()
  })

  it('test_a_transfer_needs_two_different_accounts', async () => {
    const { root, loader, harness } = await open()
    await (await loader.getHarness(SegmentedControlHarness)).select('Transfer')
    await (await loader.getHarness(AmountKeypadHarness)).press('5', '00')

    expect(text(root, 'quickAdd.from')).toBe('Everyday')
    expect(text(root, 'quickAdd.to')).toBe('Savings')
    expect((byTestId(root, 'quickAdd.save') as HTMLButtonElement).disabled).toBe(false)

    byTestId(root, 'quickAdd.to').click()
    await settle(harness)
    const everyday = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((option) =>
      option.textContent?.includes('Everyday')
    ) as HTMLElement
    everyday.click()
    await settle(harness)

    expect(text(root, 'quickAdd.to')).toBe('Everyday')
    expect(text(root, 'quickAdd.sameAccount')).toBe('Choose two different accounts.')
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
