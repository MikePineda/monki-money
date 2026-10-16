import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { provideRouter } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { i18nTesting, i18nTestingProviders } from '../../../testing/i18n-testing'
import { HouseholdDirectory } from '../../core/household/household-directory.store'
import { OutboxStore } from '../../core/outbox/outbox.store'
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

class FakeOutbox {
  readonly entries = signal([])
  readonly pendingCount = signal(0)
  readonly failedCount = signal(0)
  readonly isSyncing = signal(false)
  readonly isOnline = signal(true)
  readonly isPersisted = signal(true)
}

describe('AppShellComponent', () => {
  async function setup(lang: 'en' | 'es' = 'en') {
    const update = new FakeUpdateService()
    const outbox = new FakeOutbox()
    TestBed.configureTestingModule({
      imports: [i18nTesting({ lang })],
      providers: [
        i18nTestingProviders(),
        { provide: UpdateService, useValue: update },
        { provide: OutboxStore, useValue: outbox },
        {
          provide: HouseholdDirectory,
          useValue: { load: async () => undefined, account: () => null, category: () => null },
        },
        provideRouter([
          {
            path: '',
            component: AppShellComponent,
            children: [
              { path: 'month', component: Page },
              { path: 'transactions', component: Page },
              { path: 'settings', component: Page },
            ],
          },
        ]),
      ],
    })
    const harness = await RouterTestingHarness.create('/month')
    const loader = TestbedHarnessEnvironment.loader(harness.fixture)
    return {
      harness,
      loader,
      update,
      outbox,
      root: harness.fixture.nativeElement as HTMLElement,
    }
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

  it('test_the_sync_pill_shows_above_the_tab_bar_only_while_entries_wait', async () => {
    const { harness, root, outbox } = await setup()
    const main = root.querySelector('main') as HTMLElement
    const toasts = root.querySelector('app-toast-outlet') as HTMLElement
    expect(root.querySelector('[data-testid="outbox.pill"]')).toBeNull()
    expect(main.className).toContain('pb-[calc(var(--tabbar-height)+var(--safe-bottom))]')

    outbox.pendingCount.set(2)
    await vi.waitFor(async () => {
      await harness.fixture.whenStable()
      expect(root.querySelector('[data-testid="outbox.pill"]')?.textContent).toContain('2 pending')
    })

    expect(main.className).toContain('pb-[calc(var(--tabbar-height)+var(--safe-bottom)+52px)]')
    expect(toasts.className).toContain(
      'bottom-[calc(var(--tabbar-height)+var(--safe-bottom)+60px)]'
    )
  })
})
