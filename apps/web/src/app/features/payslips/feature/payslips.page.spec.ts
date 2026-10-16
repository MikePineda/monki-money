import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter, withComponentInputBinding } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
import { aPayslip, aPayslipCategoryTree } from '../../../../testing/payslip-fixtures'
import { anAccount, aSessionStub } from '../../../../testing/session-fixtures'
import { SessionStore } from '../../../core/auth/session.store'
import { AccountsApi } from '../../../core/household/accounts.api'
import { CategoriesApi } from '../../../core/household/categories.api'
import { MonthStore } from '../../../core/month/month.store'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'
import { PayslipsApi } from '../data-access/payslips.api'
import PayslipsPage from './payslips.page'

@Component({ template: '<p data-testid="stub">other</p>' })
class Stub {}

describe('PayslipsPage', () => {
  let api: { list: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> }
  let month: { invalidateDate: ReturnType<typeof vi.fn> }

  async function open(payslips = [aPayslip()]) {
    api = { list: vi.fn(async () => payslips), remove: vi.fn(async () => undefined) }
    month = { invalidateDate: vi.fn() }
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [
        i18nTestingProviders(),
        provideRouter(
          [
            {
              path: 'settings/accounts/:accountId/payslips',
              children: [
                { path: '', component: PayslipsPage },
                { path: 'new', component: Stub },
              ],
            },
            { path: 'settings/accounts', component: Stub },
          ],
          withComponentInputBinding()
        ),
        { provide: PayslipsApi, useValue: api },
        { provide: MonthStore, useValue: month },
        {
          provide: AccountsApi,
          useValue: {
            list: async () => [
              anAccount({ id: 1, name: 'Everyday' }),
              anAccount({ id: 3, name: 'Payroll wallet', kind: 'wallet', ownerUserId: 1 }),
            ],
          },
        },
        { provide: CategoriesApi, useValue: { tree: async () => aPayslipCategoryTree() } },
        { provide: SessionStore, useValue: aSessionStub() },
        { provide: APP_LOCALE, useValue: signal('en-AU') },
      ],
    })
    const harness = await RouterTestingHarness.create()
    await harness.navigateByUrl('/settings/accounts/3/payslips')
    const root = harness.fixture.nativeElement as HTMLElement
    await vi.waitFor(() =>
      expect(root.querySelector('[data-testid="payslips.loading"]')).toBeNull()
    )
    await harness.fixture.whenStable()
    return { harness, root }
  }

  function text(root: HTMLElement, testId: string): string {
    return (
      root.querySelector(`[data-testid="${testId}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ??
      ''
    )
  }

  it('test_lists_the_account_payslips_with_gross_deductions_and_net', async () => {
    const { root } = await open()

    expect(api.list).toHaveBeenCalledWith(3)
    expect(text(root, 'payslips.account')).toBe('Payroll wallet')
    expect(text(root, 'payslips.card.date')).toBe('Mon 31 Aug 2026')
    expect(text(root, 'payslips.card.meta')).toBe('You · To Everyday')
    expect(text(root, 'payslips.card.gross')).toBe('$5,000.00')
    expect(text(root, 'payslips.card.deductions')).toBe('$1,300.00')
    expect(text(root, 'payslips.card.net')).toBe('$3,700.00')
    const lines = [...root.querySelectorAll('[data-testid="payslips.card.line"]')].map((line) =>
      line.textContent?.replace(/\s+/g, ' ').trim()
    )
    expect(lines).toEqual(['Taxes −$1,250.00', 'Bank & service fees −$50.00'])
    expect(root.textContent).toContain('To change a payslip, delete it and record it again.')
  })

  it('test_a_joint_payslip_without_a_transfer_says_so', async () => {
    const { root } = await open([aPayslip({ userId: null, transferId: null, transfer: null })])

    expect(text(root, 'payslips.card.meta')).toBe('Joint · Not linked to a transfer')
  })

  it('test_no_payslips_offers_to_record_one', async () => {
    const { root } = await open([])

    expect(text(root, 'payslips.empty')).toContain('No payslips yet')
    expect(root.querySelector('[data-testid="payslips.empty.add"]')?.getAttribute('href')).toBe(
      '/settings/accounts/3/payslips/new'
    )
  })

  it('test_deleting_asks_first_then_removes_the_payslip', async () => {
    const { root } = await open()

    root.querySelector<HTMLButtonElement>('[data-testid="payslips.card.delete"]')?.click()
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="confirm.yes"]')).not.toBeNull()
    )
    await vi.waitFor(() =>
      expect(document.querySelector('[data-testid="confirm.body"]')?.textContent).toContain(
        'The transfer to your bank stays'
      )
    )
    expect(api.remove).not.toHaveBeenCalled()
    document.querySelector<HTMLButtonElement>('[data-testid="confirm.yes"]')?.click()

    await vi.waitFor(() => expect(api.remove).toHaveBeenCalledWith(1))
    await vi.waitFor(() =>
      expect(root.querySelector('[data-testid="payslips.empty"]')).not.toBeNull()
    )
    expect(month.invalidateDate).toHaveBeenCalledWith('2026-08-31')
  })
})
