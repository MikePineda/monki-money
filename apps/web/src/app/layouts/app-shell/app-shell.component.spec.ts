import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { provideRouter } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { i18nTesting, i18nTestingProviders } from '../../../testing/i18n-testing'
import { UpdateService } from '../../core/pwa/update.service'
import { ToastStore } from '../../core/ui/toast.store'
import { TabBarHarness } from '../../shared/ui/tab-bar/tab-bar.harness'
import { ToastHarness } from '../../shared/ui/toast/toast.harness'
import { AppShellComponent } from './app-shell.component'

@Component({ template: '<p>page</p>' })
class Page {}

class FakeUpdateService {
  readonly unrecoverable = signal(false)
  readonly reloadNow = vi.fn()
}

describe('AppShellComponent', () => {
  async function setup(lang: 'en' | 'es' = 'en') {
    const update = new FakeUpdateService()
    TestBed.configureTestingModule({
      imports: [i18nTesting({ lang })],
      providers: [
        i18nTestingProviders(),
        { provide: UpdateService, useValue: update },
        provideRouter([
          {
            path: '',
            component: AppShellComponent,
            children: [
              { path: 'month', component: Page },
              { path: 'transactions', component: Page },
              { path: 'more', component: Page },
            ],
          },
        ]),
      ],
    })
    const harness = await RouterTestingHarness.create('/month')
    const loader = TestbedHarnessEnvironment.loader(harness.fixture)
    return { harness, loader, update, root: harness.fixture.nativeElement as HTMLElement }
  }

  it('test_tab_bar_has_month_transactions_add_and_more', async () => {
    const { loader } = await setup()
    const bar = await loader.getHarness(TabBarHarness)

    expect(await bar.getNavLabel()).toBe('Main')
    expect(await bar.getTabLabels()).toEqual(['Month', 'Transactions', 'More'])
    expect(await bar.getAddLabel()).toBe('Add transaction')
    expect(await bar.getActiveTab()).toBe('Month')
  })

  it('test_tab_labels_follow_the_language', async () => {
    const { loader } = await setup('es')
    const bar = await loader.getHarness(TabBarHarness)

    expect(await bar.getTabLabels()).toEqual(['Mes', 'Movimientos', 'Más'])
  })

  it('test_renders_the_page_in_the_main_landmark_with_safe_area_padding', async () => {
    const { root } = await setup()
    const main = root.querySelector('main') as HTMLElement

    expect(main.textContent).toContain('page')
    expect(main.className).toContain('pt-safe')
    expect(main.className).toContain('max-w-app')
  })

  it('test_shows_the_current_toast_in_a_live_region', async () => {
    const { loader, harness, root } = await setup()

    TestBed.inject(ToastStore).show({ messageKey: 'pwa.update.ready', persistent: true })
    await harness.fixture.whenStable()

    const toast = await loader.getHarness(ToastHarness)
    expect(await toast.getMessage()).toBe('A new version of monkimoney is ready.')
    expect(root.querySelector('[aria-live="polite"] app-toast')).not.toBeNull()
    await toast.dismiss()
    expect(TestBed.inject(ToastStore).current()).toBeNull()
  })

  it('test_unrecoverable_service_worker_shows_a_reload_banner', async () => {
    const { harness, root, update } = await setup()
    expect(root.querySelector('app-banner')).toBeNull()

    update.unrecoverable.set(true)
    await harness.fixture.whenStable()
    const banner = root.querySelector('app-banner') as HTMLElement
    ;(banner.querySelector('button') as HTMLButtonElement).click()

    expect(banner.textContent).toContain('Reload')
    expect(update.reloadNow).toHaveBeenCalled()
  })
})
