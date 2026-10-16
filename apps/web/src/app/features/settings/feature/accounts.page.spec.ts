import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import type { Mock } from 'vitest'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
import { aSessionStub, anAccount } from '../../../../testing/session-fixtures'
import type { Account } from '../../../core/api/api-types'
import { SessionStore } from '../../../core/auth/session.store'
import { AccountsApi, type AccountInput } from '../../../core/household/accounts.api'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'
import { BottomSheetService } from '../../../shared/ui/bottom-sheet/bottom-sheet.service'
import AccountsPage from './accounts.page'

describe('AccountsPage', () => {
  let api: Record<'list' | 'create' | 'update' | 'addCard' | 'removeCard', Mock>

  /** What the API answers after a save: the balance moves with the opening balance. */
  function saved(account: Account, body: Partial<AccountInput>): Account {
    const opening = body.openingBalanceCents ?? account.openingBalanceCents
    const delta = opening - account.openingBalanceCents
    return {
      ...account,
      ...body,
      clearedBalanceCents: account.clearedBalanceCents + delta,
      availableBalanceCents: account.availableBalanceCents + delta,
    } as Account
  }

  async function open(accounts: Account[]) {
    api = {
      list: vi.fn(async () => accounts),
      create: vi.fn(async (body: AccountInput) =>
        saved(anAccount({ id: 9, name: body.name }), body)
      ),
      update: vi.fn(async (id: number, body: Partial<AccountInput>) =>
        saved(accounts.find((account) => account.id === id) as Account, body)
      ),
      addCard: vi.fn(),
      removeCard: vi.fn(),
    }
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [
        i18nTestingProviders(),
        provideRouter([{ path: 'settings/accounts', component: AccountsPage }]),
        { provide: AccountsApi, useValue: api },
        {
          provide: SessionStore,
          useValue: {
            ...aSessionStub(),
            entitlements: signal({
              llmCallsPerMonth: 200,
              maxAccounts: 6,
              maxMembers: 2,
              importsPerMonth: 30,
            }),
            onClear: () => undefined,
          },
        },
        { provide: APP_LOCALE, useValue: signal('en-AU') },
      ],
    })
    const harness = await RouterTestingHarness.create()
    await harness.navigateByUrl('/settings/accounts')
    const root = harness.fixture.nativeElement as HTMLElement
    await vi.waitFor(() => expect(text(root, 'h1')).toBe('Accounts'))
    await vi.waitFor(() => expect(root.querySelector('app-skeleton')).toBeNull())
    await harness.fixture.whenStable()
    return { root, settle: () => harness.fixture.whenStable() }
  }

  function text(root: ParentNode, selector: string): string {
    return root.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  }

  function inSheet<T extends HTMLElement = HTMLElement>(selector: string): T {
    const element = document.querySelector<T>(`app-account-sheet ${selector}`)
    if (!element) {
      throw new Error(`Nothing in the account sheet matches ${selector}`)
    }
    return element
  }

  async function sheetShown(): Promise<void> {
    await vi.waitFor(() =>
      expect(text(document, 'app-account-sheet [data-testid="accountSheet.save"]')).toBe('Save')
    )
  }

  async function press(settle: () => Promise<unknown>, ...keys: string[]): Promise<void> {
    for (const key of keys) {
      inSheet(`[data-testid="accountSheet.keypad"] button[data-key="${key}"]`).click()
    }
    await settle()
  }

  function save(): void {
    inSheet('[data-testid="accountSheet.save"]').click()
  }

  afterEach(() => TestBed.inject(BottomSheetService).closeAll())

  it('test_accounts_show_their_cleared_balance_and_the_available_one_only_when_different', async () => {
    const { root } = await open([
      anAccount({
        id: 1,
        name: 'NAB Everyday',
        clearedBalanceCents: 124_550,
        availableBalanceCents: 120_000,
      }),
      anAccount({
        id: 2,
        name: 'Visa',
        kind: 'other',
        clearedBalanceCents: -4_250,
        availableBalanceCents: -4_250,
      }),
    ])

    const everyday = root.querySelector('[data-testid="accounts.1"]') as HTMLElement
    const visa = root.querySelector('[data-testid="accounts.2"]') as HTMLElement
    expect(text(everyday, '[data-testid="accounts.balance"]')).toContain('$1,245.50')
    expect(text(everyday, '[data-testid="accounts.available"]')).toBe('Available $1,200.00')
    expect(text(visa, '[data-testid="accounts.balance"]')).toContain('−$42.50')
    expect(visa.querySelector('[data-testid="accounts.available"]')).toBeNull()
  })

  it('test_saving_an_opening_balance_refreshes_the_balance', async () => {
    const { root, settle } = await open([
      anAccount({
        id: 1,
        name: 'NAB Everyday',
        openingBalanceCents: 0,
        clearedBalanceCents: 5_000,
        availableBalanceCents: 5_000,
      }),
    ])
    root.querySelector<HTMLButtonElement>('[data-testid="accounts.1"] button')?.click()
    await settle()
    await sheetShown()
    expect(text(document, 'app-account-sheet [data-testid="accountSheet.openingBalance"]')).toBe(
      '$0.00'
    )

    inSheet('[data-testid="accountSheet.openingBalance"]').click()
    await settle()
    await press(settle, '1', '2', '3', '4', '5')
    const date = inSheet<HTMLInputElement>('[data-testid="accountSheet.openingDate"]')
    date.value = '2026-02-15'
    date.dispatchEvent(new Event('change'))
    await settle()
    expect(text(document, 'app-account-sheet [data-testid="accountSheet.openingBalance"]')).toBe(
      '$123.45'
    )
    save()

    await vi.waitFor(() =>
      expect(api.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ openingBalanceCents: 12_345, openingBalanceDate: '2026-02-15' })
      )
    )
    await vi.waitFor(() =>
      expect(text(root, '[data-testid="accounts.1"] [data-testid="accounts.balance"]')).toContain(
        '$173.45'
      )
    )
  })

  it('test_a_card_in_debt_starts_with_a_negative_opening_balance', async () => {
    const { root, settle } = await open([anAccount({ id: 1, name: 'NAB Everyday' })])
    root.querySelector<HTMLButtonElement>('[data-testid="accounts.add"]')?.click()
    await settle()
    await sheetShown()

    const name = inSheet<HTMLInputElement>('[data-testid="accountSheet.name"] input')
    name.value = 'Visa'
    name.dispatchEvent(new Event('input'))
    inSheet('[data-testid="accountSheet.openingBalance"]').click()
    await settle()
    await press(settle, '5', '0', '0', '00')
    inSheet<HTMLInputElement>('[data-testid="accountSheet.owes"] input').click()
    await settle()
    expect(text(document, 'app-account-sheet [data-testid="accountSheet.openingBalance"]')).toBe(
      '−$500.00'
    )
    save()

    await vi.waitFor(() =>
      expect(api.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Visa',
          openingBalanceCents: -50_000,
          openingBalanceDate: null,
        })
      )
    )
    await vi.waitFor(() =>
      expect(text(root, '[data-testid="accounts.9"] [data-testid="accounts.balance"]')).toContain(
        '−$500.00'
      )
    )
  })

  it('test_editing_an_account_starts_from_its_opening_balance_and_date', async () => {
    const { root, settle } = await open([
      anAccount({
        id: 1,
        name: 'Visa',
        openingBalanceCents: -2_000,
        openingBalanceDate: '2026-01-31',
      }),
    ])
    root.querySelector<HTMLButtonElement>('[data-testid="accounts.1"] button')?.click()
    await settle()
    await sheetShown()

    expect(text(document, 'app-account-sheet [data-testid="accountSheet.openingBalance"]')).toBe(
      '−$20.00'
    )
    expect(inSheet<HTMLInputElement>('[data-testid="accountSheet.owes"] input').checked).toBe(true)
    expect(inSheet<HTMLInputElement>('[data-testid="accountSheet.openingDate"]').value).toBe(
      '2026-01-31'
    )
    save()

    await vi.waitFor(() =>
      expect(api.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ openingBalanceCents: -2_000, openingBalanceDate: '2026-01-31' })
      )
    )
  })
})
