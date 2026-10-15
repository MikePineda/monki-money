import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import type { YearMonth } from '../../../domain/month'
import { APP_LOCALE } from '../app-locale.token'
import { MonthPickerComponent } from './month-picker.component'
import { MonthPickerHarness } from './month-picker.harness'

const ym = (value: string) => value as YearMonth

@Component({
  imports: [MonthPickerComponent],
  template: `
    <app-month-picker
      label="Month"
      [current]="current"
      [past]="3"
      [future]="1"
      [(selected)]="selected"
      (yearGrid)="yearGridRequests.update((n) => n + 1)"
    />
  `,
})
class Host {
  readonly current = ym('2026-01')
  readonly selected = signal(ym('2026-01'))
  readonly yearGridRequests = signal(0)
}

describe('MonthPickerComponent', () => {
  async function setup(locale = 'en-AU') {
    TestBed.configureTestingModule({
      providers: [{ provide: APP_LOCALE, useValue: signal(locale) }],
    })
    const fixture = TestBed.createComponent(Host)
    const picker = await TestbedHarnessEnvironment.loader(fixture).getHarness(MonthPickerHarness)
    return { fixture, picker, host: fixture.componentInstance }
  }

  it('test_shows_past_months_the_current_one_and_future_ones', async () => {
    const { picker } = await setup()

    expect(await picker.getLabel()).toBe('Month')
    expect(await picker.getMonths()).toEqual(['Oct', 'Nov', 'Dec', 'Jan', 'Feb'])
    expect(await picker.getSelected()).toBe('Jan')
  })

  it('test_future_months_cannot_be_selected', async () => {
    const { picker } = await setup()

    expect(await picker.isDisabled('2026-02')).toBe(true)
    expect(await picker.isDisabled('2025-12')).toBe(false)
  })

  it('test_selecting_a_month_from_another_year_shows_its_year', async () => {
    const { picker, host } = await setup()

    await picker.select('2025-12')

    expect(host.selected()).toBe('2025-12')
    expect(await picker.getSelected()).toBe('Dec 2025')
  })

  it('test_tapping_the_selected_month_asks_for_the_year_grid', async () => {
    const { picker, host } = await setup()

    await picker.select('2026-01')

    expect(host.yearGridRequests()).toBe(1)
    expect(host.selected()).toBe('2026-01')
  })

  it('test_labels_follow_the_locale', async () => {
    const { picker } = await setup('es-MX')

    expect(await picker.getMonths()).toEqual(['oct', 'nov', 'dic', 'ene', 'feb'])
  })
})
