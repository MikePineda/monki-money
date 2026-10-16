import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { Router, provideRouter, withComponentInputBinding } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
import {
  aPayoutCandidate,
  aPayslip,
  aPayslipCategoryTree,
} from '../../../../testing/payslip-fixtures'
import { aMember, aUser, anAccount, validationError } from '../../../../testing/session-fixtures'
import { SessionStore } from '../../../core/auth/session.store'
import { AccountsApi } from '../../../core/household/accounts.api'
import { CategoriesApi } from '../../../core/household/categories.api'
import { HouseholdApi } from '../../../core/household/household.api'
import { MonthStore } from '../../../core/month/month.store'
import { CLOCK } from '../../../core/platform/clock.token'
import { HOUSEHOLD_TIME_ZONE } from '../../../core/platform/time-zone.token'
import { ToastStore } from '../../../core/ui/toast.store'
import { AmountKeypadHarness } from '../../../shared/ui/amount-keypad/amount-keypad.harness'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'
import { SegmentedControlHarness } from '../../../shared/ui/segmented-control/segmented-control.harness'
import { PayslipsApi } from '../data-access/payslips.api'
import PayslipNewPage from './payslip-new.page'

@Component({ template: '<p data-testid="stub">list</p>' })
class Stub {}

describe('PayslipNewPage', () => {
  let api: { candidates: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> }
  let month: { invalidateDate: ReturnType<typeof vi.fn> }
  let toasts: { show: ReturnType<typeof vi.fn> }

  async function open(options: { walletOwner?: number | null } = {}) {
    api = {
      candidates: vi.fn(async () => [
        aPayoutCandidate({ transferId: 71, date: '2026-09-30', amountCents: 120_000 }),
        aPayoutCandidate(),
      ]),
      create: vi.fn(async () => aPayslip({ id: 9 })),
    }
    month = { invalidateDate: vi.fn() }
    toasts = { show: vi.fn() }
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [
        i18nTestingProviders(),
        provideRouter(
          [
            {
              path: 'settings/accounts/:accountId/payslips',
              children: [
                { path: '', component: Stub },
                { path: 'new', component: PayslipNewPage },
              ],
            },
          ],
          withComponentInputBinding()
        ),
        { provide: PayslipsApi, useValue: api },
        { provide: MonthStore, useValue: month },
        { provide: ToastStore, useValue: toasts },
        {
          provide: AccountsApi,
          useValue: {
            list: async () => [
              anAccount({ id: 1, name: 'Everyday' }),
              anAccount({ id: 2, name: 'Savings', kind: 'savings' }),
              anAccount({
                id: 3,
                name: 'Payroll wallet',
                kind: 'wallet',
                ownerUserId: options.walletOwner === undefined ? 1 : options.walletOwner,
              }),
            ],
          },
        },
        { provide: CategoriesApi, useValue: { tree: async () => aPayslipCategoryTree() } },
        {
          provide: HouseholdApi,
          useValue: {
            members: async () => [
              aMember({ userId: 1 }),
              aMember({ id: 101, userId: 2, fullName: 'Alex Chen', role: 'member' }),
            ],
          },
        },
        {
          provide: SessionStore,
          useValue: { user: signal(aUser({ id: 1 })), onClear: () => undefined },
        },
        { provide: APP_LOCALE, useValue: signal('en-AU') },
        { provide: HOUSEHOLD_TIME_ZONE, useValue: () => 'Australia/Brisbane' },
        { provide: CLOCK, useValue: () => new Date('2026-10-16T02:00:00Z') },
      ],
    })
    const harness = await RouterTestingHarness.create()
    await harness.navigateByUrl('/settings/accounts/3/payslips/new')
    const root = harness.fixture.nativeElement as HTMLElement
    await vi.waitFor(() =>
      expect(root.querySelector('[data-testid="payslips.form.submit"]')).not.toBeNull()
    )
    await harness.fixture.whenStable()
    const loader = TestbedHarnessEnvironment.loader(harness.fixture)

    const click = async (testId: string) => {
      root.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)?.click()
      await harness.fixture.whenStable()
    }
    const type = async (field: string, ...keys: Parameters<AmountKeypadHarness['press']>) => {
      await click(`payslips.form.${field}`)
      await (await loader.getHarness(AmountKeypadHarness)).press(...keys)
      await click(`payslips.form.${field}`)
    }
    const text = (testId: string) =>
      root.querySelector(`[data-testid="${testId}"]`)?.textContent?.replace(/\s+/g, ' ').trim()
    return { harness, root, loader, click, type, text }
  }

  it('test_linking_a_transfer_works_out_the_fee_and_saves_the_payslip', async () => {
    const { click, type, text, root } = await open()

    await click('payslips.form.candidate.70')
    expect(root.querySelector<HTMLInputElement>('[data-testid="payslips.form.date"]')?.value).toBe(
      '2026-08-31'
    )
    await type('gross', '5', '0', '0', '0', '00')
    await type('tax', '1', '2', '5', '0', '00')
    expect(text('payslips.form.fee')).toBe('$50.00')
    expect(text('payslips.form.taxCategory')).toBe('Taxes')
    expect(text('payslips.form.feeCategory')).toBe('Bank & service fees')

    await click('payslips.form.submit')

    await vi.waitFor(() => expect(TestBed.inject(Router).url).toBe('/settings/accounts/3/payslips'))
    expect(api.candidates).toHaveBeenCalledWith(3)
    expect(api.create).toHaveBeenCalledWith({
      accountId: 3,
      date: '2026-08-31',
      userId: 1,
      grossCents: 500_000,
      deductions: [
        { categoryId: 31, amountCents: 125_000, memo: null },
        { categoryId: 32, amountCents: 5_000, memo: null },
      ],
      transferId: 70,
      memo: null,
    })
    expect(month.invalidateDate).toHaveBeenCalledWith('2026-08-31')
    expect(toasts.show).toHaveBeenCalledWith({ messageKey: 'payslips.saved', status: 'good' })
  })

  it('test_the_person_defaults_to_the_wallet_owner', async () => {
    const { loader } = await open({ walletOwner: 2 })

    const person = await loader.getHarness(SegmentedControlHarness.with({ label: 'Who earned it' }))

    expect(await person.getOptions()).toEqual(['You', 'Alex', 'Joint'])
    expect(await person.getSelected()).toBe('Alex')
  })

  it('test_no_transfer_yet_needs_a_destination_and_the_net', async () => {
    const { click, type, text } = await open()

    await click('payslips.form.later')
    await type('gross', '5', '0', '0', '0', '00')
    await click('payslips.form.submit')

    await vi.waitFor(() => expect(text('payslips.new')).toContain('Choose where the net went'))
    expect(text('payslips.new')).toContain('Enter what reached the bank')
    expect(api.create).not.toHaveBeenCalled()
  })

  it('test_deductions_beyond_the_gap_block_saving', async () => {
    const { click, type, text } = await open()

    await click('payslips.form.candidate.70')
    await type('gross', '5', '0', '0', '0', '00')
    await type('tax', '1', '4', '0', '0', '00')
    expect(text('payslips.form.fee')).toBe('−$100.00')
    await click('payslips.form.submit')

    await vi.waitFor(() =>
      expect(text('payslips.form.feeError')).toBe(
        'The deductions are more than the gross minus the net'
      )
    )
    expect(api.create).not.toHaveBeenCalled()
  })

  it('test_an_extra_line_comes_out_of_the_fee_and_can_be_removed', async () => {
    const { click, type, text, loader } = await open()

    await click('payslips.form.candidate.70')
    await type('gross', '5', '0', '0', '0', '00')
    await type('tax', '1', '2', '5', '0', '00')
    // The new line opens with its keypad ready.
    await click('payslips.form.addLine')
    await (await loader.getHarness(AmountKeypadHarness)).press('2', '0', '00')
    expect(text('payslips.form.fee')).toBe('$30.00')

    await click('payslips.form.removeLine')
    expect(text('payslips.form.fee')).toBe('$50.00')
  })

  it('test_field_errors_from_the_api_show_under_their_inputs', async () => {
    const { click, type, text } = await open()
    api.create.mockRejectedValueOnce(
      validationError({ deductions: 'The gross minus the deductions must equal the net' })
    )

    await click('payslips.form.candidate.70')
    await type('gross', '5', '0', '0', '0', '00')
    await type('tax', '1', '2', '5', '0', '00')
    await click('payslips.form.submit')

    await vi.waitFor(() =>
      expect(text('payslips.form.feeError')).toBe(
        'The gross minus the deductions must equal the net'
      )
    )
    expect(TestBed.inject(Router).url).toBe('/settings/accounts/3/payslips/new')
  })
})
