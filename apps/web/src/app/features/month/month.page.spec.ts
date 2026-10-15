import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { provideRouter } from '@angular/router'
import { i18nTesting, i18nTestingProviders } from '../../../testing/i18n-testing'
import { HOUSEHOLD_TIME_ZONE } from '../../core/platform/time-zone.token'
import { currentMonthIn } from '../../domain/month'
import { APP_LOCALE } from '../../shared/ui/app-locale.token'
import { MonthPickerHarness } from '../../shared/ui/month-picker/month-picker.harness'
import MonthPage from './month.page'

describe('MonthPage', () => {
  async function setup(lang: 'en' | 'es' = 'en') {
    TestBed.configureTestingModule({
      imports: [i18nTesting({ lang })],
      providers: [
        i18nTestingProviders(),
        provideRouter([]),
        { provide: HOUSEHOLD_TIME_ZONE, useValue: () => 'Australia/Brisbane' },
        { provide: APP_LOCALE, useValue: signal(lang === 'es' ? 'es-MX' : 'en-AU') },
      ],
    })
    const fixture = TestBed.createComponent(MonthPage)
    const loader = TestbedHarnessEnvironment.loader(fixture)
    await fixture.whenStable()
    await vi.waitFor(() => {
      expect(fixture.nativeElement.querySelector('h2')?.textContent).not.toBe('')
    })
    return { fixture, loader, root: fixture.nativeElement as HTMLElement }
  }

  it('test_opens_on_the_current_month_of_the_household_time_zone', async () => {
    const { loader } = await setup()
    const picker = await loader.getHarness(MonthPickerHarness)

    expect(await picker.getSelectedValue()).toBe(currentMonthIn('Australia/Brisbane'))
  })

  it('test_empty_state_names_the_month_and_offers_quick_add', async () => {
    const { root } = await setup()
    const empty = root.querySelector('[data-testid="month.empty"]') as HTMLElement

    expect(empty.querySelector('h2')?.textContent).toMatch(/^No transactions in [A-Z][a-z]+ yet\.$/)
    expect(empty.querySelector('a[href="/add"]')?.textContent).toContain('Add transaction')
  })

  it('test_copy_switches_to_spanish', async () => {
    const { root } = await setup('es')

    expect(root.querySelector('h2')?.textContent).toMatch(/^Aún no hay movimientos en [a-z]+\.$/)
    expect(root.querySelector('h1')?.textContent).toBe('Mes')
  })
})
