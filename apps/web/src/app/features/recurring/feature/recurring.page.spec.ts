import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import type { Mock } from 'vitest'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
import { importTestingProviders, importsApiMock } from '../../../../testing/import-testing'
import { aRecurringItem } from '../../../../testing/recurring-fixtures'
import type { RecurringItem } from '../../../core/api/api-types'
import { RecurringApi } from '../../../core/ledger/recurring.api'
import { MonthStore } from '../../../core/month/month.store'
import { CLOCK } from '../../../core/platform/clock.token'
import { BottomSheetService } from '../../../shared/ui/bottom-sheet/bottom-sheet.service'
import RecurringPage from './recurring.page'

const PHONE = aRecurringItem({
  id: 2,
  payee: 'Telco One',
  cadence: 'monthly',
  amountCents: 6_500,
  nextExpectedDate: '2026-10-28',
  categoryId: 11,
  paidByUserId: 2,
})
const GYM = aRecurringItem({
  id: 3,
  payee: 'Pulse Gym',
  cadence: 'fortnightly',
  amountCents: 2_990,
  categoryId: null,
  status: 'paused',
})
const CLUB = aRecurringItem({ id: 4, payee: 'Wine Club', status: 'dismissed' })

describe('RecurringPage', () => {
  let api: Record<'list' | 'create' | 'update' | 'remove' | 'detect' | 'merchants', Mock>

  async function open(items: RecurringItem[] = [aRecurringItem(), PHONE, GYM, CLUB]) {
    api = {
      list: vi.fn(async () => items),
      create: vi.fn(async (body) => aRecurringItem({ id: 9, ...body, source: 'manual' })),
      update: vi.fn(async (id: number, body) => ({
        ...items.find((item) => item.id === id)!,
        ...body,
      })),
      remove: vi.fn(async () => undefined),
      detect: vi.fn(async () => ({ created: 1, updated: 0 })),
      merchants: vi.fn(async () => [
        {
          merchantKey: 'rent harbour lettings',
          payee: 'Rent',
          amountCents: 50_000,
          lastPaidDate: '2026-10-13',
          count: 4,
        },
        {
          merchantKey: 'telco one',
          payee: 'Telco One',
          amountCents: 6_500,
          lastPaidDate: '2026-10-03',
          count: 3,
        },
      ]),
    }
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [
        i18nTestingProviders(),
        provideRouter([{ path: 'recurring', component: RecurringPage }]),
        ...importTestingProviders({ api: importsApiMock() }),
        { provide: RecurringApi, useValue: api },
        { provide: MonthStore, useValue: { invalidate: vi.fn(), current: signal('2026-10') } },
        { provide: CLOCK, useValue: () => new Date('2026-10-16T00:00:00Z') },
      ],
    })
    const harness = await RouterTestingHarness.create()
    await harness.navigateByUrl('/recurring')
    const root = harness.fixture.nativeElement as HTMLElement
    await vi.waitFor(() => expect(text(root, 'h1')).toBe('Recurring payments'))
    await harness.fixture.whenStable()
    return { root, settle: () => harness.fixture.whenStable() }
  }

  function text(root: ParentNode, selector: string): string {
    return root.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  }

  function rows(root: ParentNode, section = 'recurring.list') {
    return [...root.querySelectorAll(`[data-testid="${section}"] [data-testid="recurring.row"]`)]
  }

  /** Picks the option named `name` in the select sheet that is (about to be) open. */
  async function choose(name: string): Promise<void> {
    const option = () =>
      [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((item) =>
        item.textContent?.includes(name)
      )
    await vi.waitFor(() => expect(option()).toBeDefined())
    option()?.click()
  }

  function sheet(): HTMLElement {
    const element = document.querySelector<HTMLElement>('app-recurring-sheet')
    if (!element) {
      throw new Error('The recurring sheet is not open')
    }
    return element
  }

  function press(...keys: string[]): void {
    for (const key of keys) {
      sheet()
        .querySelector<HTMLButtonElement>(
          `[data-testid="recurring.sheet.keypad"] [data-key="${key}"]`
        )
        ?.click()
    }
  }

  afterEach(() => TestBed.inject(BottomSheetService).closeAll())

  it('test_rows_show_payee_cadence_next_date_category_and_amount', async () => {
    const { root } = await open()
    await vi.waitFor(() => expect(text(root, '[data-testid="recurring.meta"]')).toContain('Rent'))

    expect(
      rows(root).map((row) => [
        text(row, '[data-testid="recurring.payee"]'),
        text(row, '[data-testid="recurring.meta"]'),
        text(row, '[data-testid="recurring.amount"]'),
      ])
    ).toEqual([
      ['Harbour Lettings', 'Weekly · Next 20 Oct · Rent', '$500.00'],
      ['Telco One', 'Monthly · Next 28 Oct · Utilities', '$65.00'],
    ])
  })

  it('test_paused_and_dismissed_items_have_their_own_headings', async () => {
    const { root } = await open()

    expect(text(root, '[data-testid="recurring.paused"] h2')).toBe('Paused')
    expect(rows(root, 'recurring.paused').map((row) => row.getAttribute('data-id'))).toEqual(['3'])
    expect(text(root, '[data-testid="recurring.paused"]')).toContain('No category')
    expect(text(root, '[data-testid="recurring.dismissed"] h2')).toBe('Dismissed')
    // A dismissed item is not due any more: no next date.
    expect(text(rows(root, 'recurring.dismissed')[0], '[data-testid="recurring.meta"]')).toBe(
      'Weekly · Rent'
    )
  })

  it('test_pausing_an_item_from_its_sheet', async () => {
    const { root, settle } = await open()

    ;(rows(root)[1] as HTMLElement).click()
    await choose('Pause')
    await settle()

    expect(api.update).toHaveBeenCalledWith(2, { status: 'paused' })
    await vi.waitFor(() =>
      expect(rows(root, 'recurring.paused').map((row) => row.getAttribute('data-id'))).toEqual([
        '2',
        '3',
      ])
    )
  })

  it('test_a_dismissed_item_can_only_be_restored', async () => {
    const { root, settle } = await open()

    ;(rows(root, 'recurring.dismissed')[0] as HTMLElement).click()
    await vi.waitFor(() => expect(document.querySelector('[role="option"]')).not.toBeNull())
    expect(
      [...document.querySelectorAll('[role="option"]')].map((option) => option.textContent?.trim())
    ).toEqual(['Restore'])
    await choose('Restore')
    await settle()

    expect(api.update).toHaveBeenCalledWith(4, { status: 'active' })
  })

  it('test_editing_sends_only_the_amount_cadence_and_person_that_changed', async () => {
    const { root, settle } = await open()

    ;(rows(root)[0] as HTMLElement).click()
    await choose('Edit')
    await vi.waitFor(() => expect(sheet().textContent).toContain('Edit Harbour Lettings'))
    sheet().querySelector<HTMLButtonElement>('[data-testid="recurring.sheet.amount"]')?.click()
    await settle()
    press('backspace', 'backspace', 'backspace', 'backspace', 'backspace')
    press('5', '2', '0', '00')
    sheet().querySelector<HTMLButtonElement>('[data-cadence="fortnightly"]')?.click()
    sheet().querySelector<HTMLButtonElement>('[data-testid="recurring.sheet.person"]')?.click()
    await choose('Alex')
    await settle()
    sheet().querySelector<HTMLButtonElement>('[data-testid="recurring.sheet.save"]')?.click()
    await settle()

    await vi.waitFor(() =>
      expect(api.update).toHaveBeenCalledWith(1, {
        amountCents: 52_000,
        cadence: 'fortnightly',
        paidByUserId: 2,
      })
    )
    await vi.waitFor(() => expect(document.querySelector('app-recurring-sheet')).toBeNull())
  })

  it('test_adding_one_by_hand_needs_a_merchant_and_an_amount', async () => {
    const { root, settle } = await open()

    root.querySelector<HTMLButtonElement>('[data-testid="recurring.add"]')?.click()
    await vi.waitFor(() => expect(sheet().textContent).toContain('Add a recurring payment'))
    const save = () =>
      sheet().querySelector<HTMLButtonElement>('[data-testid="recurring.sheet.save"]')
    expect(save()?.disabled).toBe(true)

    const payee = sheet().querySelector<HTMLInputElement>(
      '[data-testid="recurring.sheet.payee"] input'
    )
    payee!.value = 'Pulse Gym'
    payee!.dispatchEvent(new Event('input'))
    sheet().querySelector<HTMLButtonElement>('[data-testid="recurring.sheet.amount"]')?.click()
    await settle()
    press('2', '9', '9', '0')
    sheet().querySelector<HTMLButtonElement>('[data-cadence="fortnightly"]')?.click()
    await settle()
    expect(save()?.disabled).toBe(false)
    save()?.click()
    await settle()

    await vi.waitFor(() =>
      expect(api.create).toHaveBeenCalledWith({
        payee: 'Pulse Gym',
        cadence: 'fortnightly',
        amountCents: 2_990,
        nextExpectedDate: '2026-10-16',
        categoryId: null,
        paidByUserId: null,
      })
    )
  })

  it('test_adding_one_offers_the_merchants_paid_lately_and_keys_it_like_the_bank', async () => {
    const { root, settle } = await open()

    root.querySelector<HTMLButtonElement>('[data-testid="recurring.add"]')?.click()
    await vi.waitFor(() =>
      expect(sheet().querySelectorAll('[data-testid="recurring.sheet.suggestion"]')).toHaveLength(2)
    )
    expect(sheet().textContent).toContain('$500.00 · 4 payments')

    // Typing narrows them; picking one fills the name and the usual amount.
    const payee = sheet().querySelector<HTMLInputElement>(
      '[data-testid="recurring.sheet.payee"] input'
    )
    payee!.value = 'harb'
    payee!.dispatchEvent(new Event('input'))
    await settle()
    const offered = sheet().querySelectorAll<HTMLButtonElement>(
      '[data-testid="recurring.sheet.suggestion"]'
    )
    expect(offered).toHaveLength(1)
    offered[0].click()
    await settle()
    expect(sheet().querySelector('[data-testid="recurring.sheet.suggestions"]')).toBeNull()
    expect(text(sheet(), '[data-testid="recurring.sheet.amount"]')).toBe('$500.00')
    sheet().querySelector<HTMLButtonElement>('[data-cadence="weekly"]')?.click()
    await settle()
    sheet().querySelector<HTMLButtonElement>('[data-testid="recurring.sheet.save"]')?.click()

    await vi.waitFor(() =>
      expect(api.create).toHaveBeenCalledWith({
        payee: 'Rent',
        merchantKey: 'rent harbour lettings',
        cadence: 'weekly',
        amountCents: 50_000,
        nextExpectedDate: '2026-10-16',
        categoryId: null,
        paidByUserId: null,
      })
    )
  })

  it('test_an_item_paused_by_detection_says_since_when_nothing_was_paid', async () => {
    const lapsed = aRecurringItem({
      id: 5,
      payee: 'Old Streaming',
      cadence: 'monthly',
      status: 'paused',
      pausedByDetection: true,
      lastPaidDate: '2026-06-05',
      categoryId: null,
    })
    const { root } = await open([aRecurringItem(), lapsed])

    await vi.waitFor(() =>
      expect(text(rows(root, 'recurring.paused')[0], '[data-testid="recurring.meta"]')).toBe(
        'Monthly · Paused: no payment since 5 June · No category'
      )
    )
  })

  it('test_the_empty_state_explains_detection_and_runs_it', async () => {
    const { root, settle } = await open([])
    await vi.waitFor(() =>
      expect(text(root, '[data-testid="recurring.empty"]')).toContain('about three payments')
    )

    root.querySelector<HTMLButtonElement>('[data-testid="recurring.empty.detect"]')?.click()
    await settle()

    expect(api.detect).toHaveBeenCalledTimes(1)
    expect(api.list).toHaveBeenCalledTimes(2)
  })
})
