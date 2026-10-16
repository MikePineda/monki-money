import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideRouter } from '@angular/router'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
import type { MonthReport } from '../../../core/ledger/reports.api'
import { APP_LOCALE } from '../../../shared/ui/app-locale.token'
import { CommittedCardComponent } from './committed-card.component'

type Committed = MonthReport['committed']

const RENT = { id: 1, payee: 'Harbour Lettings', amountCents: 50_000, categoryId: 10 }

function committed(overrides: Partial<Committed> = {}): Committed {
  return {
    paidCents: 100_000,
    upcomingCents: 106_500,
    recurringCount: 2,
    items: [
      { ...RENT, dueDate: '2026-10-06', paid: true },
      { ...RENT, dueDate: '2026-10-13', paid: true },
      { ...RENT, dueDate: '2026-10-20', paid: false },
      { ...RENT, dueDate: '2026-10-27', paid: false },
      {
        id: 2,
        payee: 'Telco One',
        amountCents: 6_500,
        dueDate: '2026-10-28',
        paid: false,
        categoryId: null,
      },
    ],
    ...overrides,
  }
}

describe('CommittedCardComponent', () => {
  async function render(
    value: Committed,
    options: { incomeCents?: number; expenseCents?: number; lang?: 'en' | 'es' } = {}
  ) {
    const lang = options.lang ?? 'en'
    TestBed.configureTestingModule({
      imports: [i18nTesting({ lang })],
      providers: [
        i18nTestingProviders(),
        provideRouter([]),
        { provide: APP_LOCALE, useValue: signal(lang === 'es' ? 'es-MX' : 'en-AU') },
      ],
    })
    const fixture = TestBed.createComponent(CommittedCardComponent)
    fixture.componentRef.setInput('committed', value)
    fixture.componentRef.setInput('incomeCents', options.incomeCents ?? 645_000)
    fixture.componentRef.setInput('expenseCents', options.expenseCents ?? 328_450)
    const root = fixture.nativeElement as HTMLElement
    // Wait for the scope catalogue: until it loads, its labels render empty.
    await vi.waitFor(() =>
      expect(root.textContent).toMatch(
        /Already paid|Ya pagado|recurring payments|pagos recurrentes/
      )
    )
    await fixture.whenStable()
    return { fixture, root }
  }

  function text(root: ParentNode, selector: string): string {
    return root.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  }

  it('test_it_shows_already_paid_still_due_and_free_after_bills', async () => {
    const { root } = await render(committed())

    expect(text(root, '[data-testid="month.committed.paid"]')).toBe('Already paid $1,000.00')
    expect(text(root, '[data-testid="month.committed.due"]')).toBe('Still due $1,065.00')
    // 6,450 earned − 3,284.50 spent − 1,065 still due.
    expect(text(root, '[data-testid="month.committed.free"]')).toBe('Free after bills $2,100.50')
  })

  it('test_due_items_list_payee_date_and_amount_with_paid_ones_ticked', async () => {
    const { root } = await render(committed())

    const rows = [...root.querySelectorAll('[data-testid="month.committed.item"]')]
    const leaves = (row: Element) =>
      [...row.querySelectorAll('span')]
        .filter((span) => span.children.length === 0)
        .map((span) => span.textContent?.trim())
    expect(rows.map(leaves)).toEqual([
      ['Harbour Lettings', 'Paid 6 Oct', '$500.00'],
      ['Harbour Lettings', 'Paid 13 Oct', '$500.00'],
      ['Harbour Lettings', 'Due 20 Oct', '$500.00'],
      ['Harbour Lettings', 'Due 27 Oct', '$500.00'],
      ['Telco One', 'Due 28 Oct', '$65.00'],
    ])
    expect(rows.map((row) => row.getAttribute('data-paid'))).toEqual([
      'true',
      'true',
      'false',
      'false',
      'false',
    ])
    expect(rows.map((row) => row.querySelector('svg')?.getAttribute('data-icon'))).toEqual([
      'circle-check',
      'circle-check',
      'calendar',
      'calendar',
      'calendar',
    ])
    expect(root.querySelector('[data-testid="month.committed.manage"]')?.getAttribute('href')).toBe(
      '/recurring'
    )
  })

  it('test_free_after_bills_turns_critical_when_bills_take_more_than_is_left', async () => {
    const { root } = await render(committed(), { incomeCents: 0, expenseCents: 0 })

    const free = root.querySelector('[data-testid="month.committed.free"] dd')
    expect(free?.textContent?.trim()).toBe('−$1,065.00')
    expect(free?.className).toContain('text-status-critical')
  })

  it('test_nothing_left_to_pay_says_so', async () => {
    const { root } = await render(committed({ upcomingCents: 0, paidCents: 0, items: [] }))

    expect(text(root, '[data-testid="month.committed"]')).toContain(
      'Nothing else falls due this month.'
    )
  })

  it('test_without_recurring_payments_a_hint_offers_to_detect_them', async () => {
    const { fixture, root } = await render(
      committed({ recurringCount: 0, items: [], paidCents: 0, upcomingCents: 0 })
    )
    const detect = vi.fn()
    fixture.componentInstance.detect.subscribe(detect)

    expect(root.querySelector('[data-testid="month.committed"]')).toBeNull()
    expect(text(root, '[data-testid="month.committed.hint"]')).toContain(
      'Detect recurring payments'
    )
    root.querySelector<HTMLButtonElement>('[data-testid="month.committed.detect"]')?.click()
    expect(detect).toHaveBeenCalledTimes(1)

    fixture.componentRef.setInput('detecting', true)
    await fixture.whenStable()
    const button = root.querySelector<HTMLButtonElement>('[data-testid="month.committed.detect"]')
    expect(button?.disabled).toBe(true)
    expect(button?.textContent).toContain('Looking for recurring payments')
  })

  it('test_the_card_speaks_spanish', async () => {
    const { root } = await render(committed(), { lang: 'es' })

    expect(text(root, '[data-testid="month.committed.paid"]')).toMatch(/^Ya pagado /)
    expect(text(root, '[data-testid="month.committed.item"]')).toMatch(/Pagado el 6 oct/)
  })
})
