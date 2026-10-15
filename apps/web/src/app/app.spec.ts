import { TestBed } from '@angular/core/testing'
import { Router, provideRouter, withComponentInputBinding } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { provideServiceWorker } from '@angular/service-worker'
import { i18nTesting, i18nTestingProviders } from '../testing/i18n-testing'
import { App } from './app'
import { routes } from './app.routes'

describe('app routes', () => {
  async function navigate(url: string): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [
        i18nTestingProviders(),
        provideRouter(routes, withComponentInputBinding()),
        provideServiceWorker('ngsw-worker.js', { enabled: false }),
      ],
    })
    const harness = await RouterTestingHarness.create()
    await harness.navigateByUrl(url)
    await harness.fixture.whenStable()
    return harness.fixture.nativeElement as HTMLElement
  }

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

  it('test_main_tabs_render_inside_the_shell', async () => {
    for (const [url, testId] of [
      ['/transactions', 'transactions.empty'],
      ['/more', 'more.empty'],
    ]) {
      TestBed.resetTestingModule()
      const page = await navigate(url)
      expect(page.querySelector('[data-testid="app.shell"]'), url).not.toBeNull()
      expect(page.querySelector(`[data-testid="${testId}"]`), url).not.toBeNull()
    }
  })

  it('test_quick_add_is_full_screen_without_the_tab_bar', async () => {
    const page = await navigate('/add?type=income')

    expect(page.querySelector('[data-testid="add.empty"]')).not.toBeNull()
    expect(page.querySelector('app-tab-bar')).toBeNull()
  })

  it('test_unknown_urls_land_on_the_month_view', async () => {
    await navigate('/nope')

    expect(TestBed.inject(Router).url).toBe('/month')
  })

  it('test_the_ui_kit_gallery_is_routed_in_development', async () => {
    const page = await navigate('/__kit')

    expect(TestBed.inject(Router).url).toBe('/__kit')
    expect(page.querySelector('[data-testid="kit.page"]')).not.toBeNull()
  })
})
