import { TestBed } from '@angular/core/testing'
import { Router, provideRouter, withComponentInputBinding } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { provideServiceWorker } from '@angular/service-worker'
import { i18nTesting, i18nTestingProviders } from '../testing/i18n-testing'
import { aMe, aMember, anAccount, httpError, type SessionKind } from '../testing/session-fixtures'
import { App } from './app'
import { routes } from './app.routes'
import { AuthApi } from './core/auth/auth.api'
import { SessionStore } from './core/auth/session.store'
import { AccountsApi } from './core/household/accounts.api'
import { CategoriesApi } from './core/household/categories.api'
import { HouseholdApi } from './core/household/household.api'
import { ReportsApi } from './core/ledger/reports.api'
import { TransactionsApi as LedgerTransactionsApi } from './core/ledger/transactions.api'
import { TransactionsApi } from './features/transactions/data-access/transactions.api'
import { aCategoryTree, aMonthReport, aTrendReport } from '../testing/ledger-fixtures'
import type { YearMonth } from './domain/month'

type State = SessionKind | 'guest'

describe('app routes', () => {
  async function navigate(
    url: string,
    state: State = 'owner',
    options: { accounts?: number } = {}
  ): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [
        i18nTestingProviders(),
        provideRouter(routes, withComponentInputBinding()),
        provideServiceWorker('ngsw-worker.js', { enabled: false }),
        {
          provide: AuthApi,
          useValue: {
            me: async () => {
              if (state === 'guest') {
                throw httpError(401)
              }
              return aMe(state)
            },
            config: async () => ({ registrationOpen: true, version: 'test' }),
            health: async () => ({ status: 'ok', version: '0.1.0', sha: 'abc', checks: {} }),
          },
        },
        {
          provide: AccountsApi,
          useValue: {
            list: async () => Array.from({ length: options.accounts ?? 1 }, () => anAccount()),
          },
        },
        {
          provide: HouseholdApi,
          useValue: { members: async () => [aMember()], invitations: async () => [] },
        },
        { provide: CategoriesApi, useValue: { tree: async () => aCategoryTree() } },
        {
          provide: ReportsApi,
          useValue: {
            month: async (month: YearMonth) => aMonthReport(month),
            trend: async (month: YearMonth) => aTrendReport(month),
          },
        },
        { provide: LedgerTransactionsApi, useValue: { list: async () => [] } },
        {
          provide: TransactionsApi,
          useValue: { list: async () => ({ rows: [], page: 1, lastPage: 1, total: 0 }) },
        },
      ],
    })
    await TestBed.inject(SessionStore).load()
    const harness = await RouterTestingHarness.create()
    await harness.navigateByUrl(url)
    await harness.fixture.whenStable()
    return harness.fixture.nativeElement as HTMLElement
  }

  afterEach(() => localStorage.clear())

  it('test_root_is_a_bare_router_outlet', async () => {
    const fixture = TestBed.createComponent(App)
    await fixture.whenStable()

    expect((fixture.nativeElement as HTMLElement).querySelector('router-outlet')).not.toBeNull()
  })

  it('test_root_url_redirects_to_the_month_view_inside_the_shell', async () => {
    const page = await navigate('/')

    expect(TestBed.inject(Router).url).toBe('/month')
    expect(page.querySelector('[data-testid="app.shell"]')).not.toBeNull()
    expect(page.querySelector('[data-testid="month.empty"]')).not.toBeNull()
    expect(page.querySelector('app-tab-bar')).not.toBeNull()
  })

  it('test_a_guest_lands_on_login_inside_the_auth_layout', async () => {
    const page = await navigate('/', 'guest')

    expect(TestBed.inject(Router).url).toBe('/login')
    expect(page.querySelector('[data-testid="auth.layout"]')).not.toBeNull()
    expect(page.querySelector('app-tab-bar')).toBeNull()
  })

  it('test_a_guest_deep_link_comes_back_after_login', async () => {
    await navigate('/settings', 'guest')

    expect(TestBed.inject(Router).url).toBe('/login?returnUrl=%2Fsettings')
  })

  it('test_an_unverified_user_is_asked_to_check_their_email', async () => {
    await navigate('/month', 'unverified')

    expect(TestBed.inject(Router).url).toBe('/verify-email')
  })

  it('test_an_owner_without_accounts_is_sent_to_onboarding', async () => {
    const page = await navigate('/month', 'owner', { accounts: 0 })

    expect(TestBed.inject(Router).url).toBe('/onboarding')
    expect(page.querySelector('[data-testid="onboarding.page"]')).not.toBeNull()
  })

  it('test_a_household_pending_deletion_shows_the_restore_screen', async () => {
    await navigate('/month', 'pendingDeletion')

    expect(TestBed.inject(Router).url).toBe('/household-deleted')
  })

  it('test_main_tabs_render_inside_the_shell', async () => {
    for (const [url, testId] of [
      ['/transactions', 'transactions.empty'],
      ['/categories', 'categories.page'],
      ['/settings', 'settings.profile'],
    ]) {
      TestBed.resetTestingModule()
      const page = await navigate(url)
      expect(page.querySelector('[data-testid="app.shell"]'), url).not.toBeNull()
      expect(page.querySelector(`[data-testid="${testId}"]`), url).not.toBeNull()
    }
  })

  it('test_a_session_that_ended_sends_the_next_tab_to_login', async () => {
    await navigate('/settings')
    TestBed.inject(SessionStore).clear()

    await TestBed.inject(Router).navigateByUrl('/transactions')

    expect(TestBed.inject(Router).url).toBe('/login?returnUrl=%2Ftransactions')
  })

  it('test_the_old_more_tab_url_opens_settings', async () => {
    await navigate('/more')

    expect(TestBed.inject(Router).url).toBe('/settings')
  })

  it('test_quick_add_is_full_screen_without_the_tab_bar', async () => {
    const page = await navigate('/add?type=income')

    expect(page.querySelector('[data-testid="quickAdd.page"]')).not.toBeNull()
    expect(page.querySelector('app-tab-bar')).toBeNull()
  })

  it('test_upgrade_is_hidden_without_the_billing_flag', async () => {
    await navigate('/upgrade')

    expect(TestBed.inject(Router).url).toBe('/month')
  })

  it('test_unknown_urls_land_on_the_month_view', async () => {
    await navigate('/nope')

    expect(TestBed.inject(Router).url).toBe('/month')
  })

  it('test_legal_pages_are_public', async () => {
    const page = await navigate('/legal/privacy', 'guest')

    expect(TestBed.inject(Router).url).toBe('/legal/privacy')
    expect(page.querySelector('[data-testid="legal.privacy"]')).not.toBeNull()
  })

  it('test_the_ui_kit_gallery_is_routed_in_development', async () => {
    const page = await navigate('/__kit')

    expect(TestBed.inject(Router).url).toBe('/__kit')
    expect(page.querySelector('[data-testid="kit.page"]')).not.toBeNull()
  })
})
