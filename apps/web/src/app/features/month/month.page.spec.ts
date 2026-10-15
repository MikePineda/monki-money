import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { Router, provideRouter, withComponentInputBinding } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { i18nTesting, i18nTestingProviders } from '../../../testing/i18n-testing'
import {
  aCategoryTree,
  aMonthReport,
  aTransaction,
  aTrendReport,
} from '../../../testing/ledger-fixtures'
import { aMember, aUser, anAccount } from '../../../testing/session-fixtures'
import type { MonthReport } from '../../core/ledger/reports.api'
import { SessionStore } from '../../core/auth/session.store'
import { AccountsApi } from '../../core/household/accounts.api'
import { CategoriesApi } from '../../core/household/categories.api'
import { HouseholdApi } from '../../core/household/household.api'
import { ReportsApi } from '../../core/ledger/reports.api'
import { TransactionsApi } from '../../core/ledger/transactions.api'
import { HOUSEHOLD_TIME_ZONE } from '../../core/platform/time-zone.token'
import { addMonths, currentMonthIn, type YearMonth } from '../../domain/month'
import { BarListHarness } from '../../shared/charts/bar-list/bar-list.harness'
import { APP_LOCALE } from '../../shared/ui/app-locale.token'
import { MonthPickerHarness } from '../../shared/ui/month-picker/month-picker.harness'
import { InsightsApi } from './data-access/insights.api'
import MonthPage from './month.page'

const TZ = 'Australia/Brisbane'
const NOW = currentMonthIn(TZ)
const PREVIOUS = addMonths(NOW, -1)

/** A month like the design's: housing (1), food (2), an uncategorised and a private bucket. */
function busyMonth(month: YearMonth): MonthReport {
  return aMonthReport(month, {
    incomeCents: 645_000,
    expenseCents: 328_450,
    netCents: 316_550,
    transactionCount: 42,
    byGroup: [
      { bucket: 'group', groupId: 1, kind: 'expense', amountCents: 162_000, count: 1 },
      { bucket: 'group', groupId: 2, kind: 'expense', amountCents: 150_450, count: 30 },
      { bucket: 'uncategorized', groupId: null, kind: 'expense', amountCents: 10_000, count: 2 },
      { bucket: 'private', groupId: null, kind: 'expense', amountCents: 6_000, count: 1 },
      { bucket: 'group', groupId: 3, kind: 'income', amountCents: 645_000, count: 2 },
    ],
    byCategory: [
      {
        bucket: 'category',
        categoryId: 10,
        groupId: 1,
        kind: 'expense',
        amountCents: 162_000,
        count: 1,
      },
      {
        bucket: 'category',
        categoryId: 20,
        groupId: 2,
        kind: 'expense',
        amountCents: 150_450,
        count: 30,
      },
    ],
    byPerson: [
      { bucket: 'member', userId: 1, incomeCents: 0, expenseCents: 151_000, netCents: -151_000 },
      { bucket: 'member', userId: 2, incomeCents: 0, expenseCents: 101_800, netCents: -101_800 },
      { bucket: 'joint', userId: null, incomeCents: 0, expenseCents: 75_650, netCents: -75_650 },
    ],
  } as Partial<MonthReport>)
}

describe('MonthPage', () => {
  let reports: { month: ReturnType<typeof vi.fn>; trend: ReturnType<typeof vi.fn> }

  async function open(
    url = '/month',
    options: { report?: (month: YearMonth) => MonthReport; lang?: 'en' | 'es' } = {}
  ) {
    const lang = options.lang ?? 'en'
    reports = {
      month: vi.fn(async (month: YearMonth) => (options.report ?? busyMonth)(month)),
      trend: vi.fn(async (month: YearMonth) => {
        const trend = aTrendReport(month, [300_000, 320_000, 310_000, 300_000, 357_120, 328_450])
        return {
          ...trend,
          totals: trend.totals.map((total, index) =>
            index === 5 ? { ...total, incomeCents: 645_000, netCents: 316_550 } : total
          ),
          series: [
            {
              bucket: 'group',
              id: 2,
              kind: 'expense',
              totalCents: 0,
              points: [0, 0, 100_000, 100_000, 100_000, 150_450].map((amountCents, index) => ({
                month: trend.months[index],
                amountCents,
              })),
            },
          ],
        }
      }),
    }
    TestBed.configureTestingModule({
      imports: [i18nTesting({ lang })],
      providers: [
        i18nTestingProviders(),
        provideRouter(
          [
            { path: 'month', component: MonthPage },
            { path: 'month/:ym', component: MonthPage },
          ],
          withComponentInputBinding()
        ),
        { provide: ReportsApi, useValue: reports },
        {
          provide: TransactionsApi,
          useValue: {
            list: async () => [
              aTransaction({
                id: 1,
                payee: 'Landlord Pty',
                categoryId: 10,
                amountCents: -162_000,
                date: `${NOW}-01`,
              }),
              aTransaction({
                id: 2,
                payee: null,
                isMasked: true,
                paidByUserId: 2,
                amountCents: -6_000,
                date: `${NOW}-03`,
              }),
            ],
          },
        },
        { provide: InsightsApi, useValue: { show: async () => null, generate: vi.fn() } },
        { provide: AccountsApi, useValue: { list: async () => [anAccount()] } },
        { provide: CategoriesApi, useValue: { tree: async () => aCategoryTree() } },
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
        { provide: HOUSEHOLD_TIME_ZONE, useValue: () => TZ },
        { provide: APP_LOCALE, useValue: signal(lang === 'es' ? 'es-MX' : 'en-AU') },
      ],
    })
    const harness = await RouterTestingHarness.create()
    await harness.navigateByUrl(url)
    const root = harness.fixture.nativeElement as HTMLElement
    // Wait for the scope catalogue: until it loads, keys render as themselves.
    await vi.waitFor(() => {
      expect(root.querySelector('[data-testid="month.content"]')).not.toBeNull()
      expect(text(root, 'h1')).toMatch(/^(Month|Mes)$/)
      expect(text(root, 'app-month-hero p')).not.toMatch(/^month\./)
    })
    await harness.fixture.whenStable()
    return { harness, root, loader: TestbedHarnessEnvironment.loader(harness.fixture) }
  }

  function text(root: ParentNode, selector: string): string {
    return root.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
  }

  it('test_the_hero_is_money_spent_with_the_change_against_last_month', async () => {
    const { root } = await open()

    expect(text(root, '[data-testid="month.hero"]')).toBe('$3,284.50')
    expect(text(root, '[data-testid="month.delta"]')).toMatch(/^8% less than \w+ \(\$3,571\.20\)$/)
    expect(root.querySelector('[data-testid="month.delta"] app-icon')?.className).toContain(
      'text-status-good'
    )
  })

  it('test_stat_tiles_show_income_spent_and_net_saved', async () => {
    const { root } = await open()

    expect(text(root, '[data-testid="month.stats.income"]')).toContain('$6,450')
    expect(text(root, '[data-testid="month.stats.spent"]')).toContain('$3,285')
    expect(text(root, '[data-testid="month.stats.saved"]')).toContain('$3,166')
  })

  it('test_spending_by_category_comes_from_the_month_report_with_other_buckets_last', async () => {
    const { loader } = await open()
    const bars = await loader.getHarness(BarListHarness)

    expect((await bars.getRows()).map((row) => row.label)).toEqual([
      'Housing',
      'Food',
      'Uncategorised',
      'Private',
    ])
  })

  it('test_top_transactions_mask_the_partners_private_rows', async () => {
    const { root } = await open()
    const rows = [...root.querySelectorAll('[data-testid="month.top"] app-list-row')]

    expect(rows.map((row) => row.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      expect.stringContaining('Landlord Pty'),
      expect.stringContaining('Private'),
    ])
    expect(rows[0]?.textContent).toContain('Rent')
  })

  it('test_two_deterministic_insights', async () => {
    const { root } = await open()
    const cards = [...root.querySelectorAll('[data-testid="month.insight"]')].map((card) =>
      card.textContent?.replace(/\s+/g, ' ').trim()
    )

    expect(cards).toEqual([
      expect.stringContaining('Food is 50% above your 3-month average.'),
      expect.stringContaining('You saved 49% of your income this month.'),
    ])
  })

  it('test_the_ai_summary_card_leads_the_insights_for_the_month_on_screen', async () => {
    const { root } = await open(`/month/${PREVIOUS}`)

    const section = root.querySelector('[data-testid="month.insights"]')
    expect(section?.firstElementChild?.nextElementSibling?.tagName).toBe('APP-INSIGHT-SUMMARY-CARD')
    await vi.waitFor(() =>
      expect(text(root, '[data-testid="month.summary.missing"]')).toMatch(/^Get your summary for/)
    )
  })

  it('test_a_month_without_transactions_shows_the_empty_state', async () => {
    const { root } = await open('/month', { report: (month) => aMonthReport(month) })

    expect(text(root, '[data-testid="month.hero"]')).toBe('$0.00')
    expect(text(root, '[data-testid="month.empty"] h2')).toMatch(/^Nothing in [A-Z][a-z]+ yet\.$/)
    expect(root.querySelector('[data-testid="month.empty"] a[href="/add"]')).not.toBeNull()
    expect(root.querySelector('[data-testid="month.spend"]')).toBeNull()
  })

  it('test_the_url_month_is_shown_and_the_strip_changes_it', async () => {
    const { loader, harness } = await open(`/month/${PREVIOUS}`)
    const picker = await loader.getHarness(MonthPickerHarness)

    expect(await picker.getSelectedValue()).toBe(PREVIOUS)
    expect(reports.month).toHaveBeenCalledWith(PREVIOUS)

    await picker.select(addMonths(NOW, -2))
    await harness.fixture.whenStable()
    expect(TestBed.inject(Router).url).toBe(`/month/${addMonths(NOW, -2)}`)
  })

  it('test_a_future_or_invalid_month_falls_back_to_the_current_one', async () => {
    const { loader } = await open(`/month/${addMonths(NOW, 3)}`)

    expect(await (await loader.getHarness(MonthPickerHarness)).getSelectedValue()).toBe(NOW)
  })

  it('test_copy_switches_to_spanish', async () => {
    const { root } = await open('/month', { lang: 'es' })

    expect(text(root, 'h1')).toBe('Mes')
    expect(text(root, '[data-testid="month.delta"]')).toMatch(
      /^8% menos que [a-z]+ \(\$3,571\.20\)$/
    )
  })
})
