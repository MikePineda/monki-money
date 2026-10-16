import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
import type { YearMonth } from '../../../domain/month'
import { APP_LOCALE } from '../app-locale.token'
import { BottomSheetService } from '../bottom-sheet/bottom-sheet.service'
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
    />
  `,
})
class Host {
  readonly current = ym('2026-01')
  readonly selected = signal(ym('2026-01'))
}

/** The year grid sheet, rendered in the overlay outside the fixture. */
function yearGrid(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-testid="monthPicker.yearGrid"]')
}

function gridMonth(month: string): HTMLButtonElement | null {
  return yearGrid()?.querySelector<HTMLButtonElement>(`button[data-month="${month}"]`) ?? null
}

describe('MonthPickerComponent', () => {
  async function setup(locale = 'en-AU') {
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [i18nTestingProviders(), { provide: APP_LOCALE, useValue: signal(locale) }],
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

  afterEach(() => TestBed.inject(BottomSheetService).closeAll())

  it('test_tapping_the_selected_month_opens_the_year_grid', async () => {
    const { picker, host, fixture } = await setup()

    await picker.select('2026-01')
    await fixture.whenStable()

    const grid = yearGrid()
    expect(grid?.textContent).toContain('Choose a month')
    // This year and the two before it, newest first, twelve months each.
    expect(
      [...(grid?.querySelectorAll('h3') ?? [])].map((year) => year.textContent?.trim())
    ).toEqual(['2026', '2025', '2024'])
    expect(grid?.querySelectorAll('button[data-month]')).toHaveLength(36)
    expect(gridMonth('2026-01')?.getAttribute('aria-current')).toBe('date')
    expect(gridMonth('2026-02')?.disabled).toBe(true)
    expect(gridMonth('2024-03')?.textContent?.trim()).toBe('Mar')
    expect(host.selected()).toBe('2026-01')
  })

  it('test_picking_a_month_in_the_year_grid_selects_it_and_the_strip_follows', async () => {
    const { picker, host, fixture } = await setup()
    await picker.select('2026-01')
    await fixture.whenStable()

    gridMonth('2024-03')?.click()
    await fixture.whenStable()

    expect(host.selected()).toBe('2024-03')
    expect(yearGrid()).toBeNull()
    // Older than the months the strip offers: the strip reaches back to it.
    expect(await picker.getSelectedValue()).toBe('2024-03')
    expect(await picker.getSelected()).toBe('Mar 2024')
  })

  it('test_dismissing_the_year_grid_keeps_the_month', async () => {
    const { picker, host, fixture } = await setup()
    await picker.select('2026-01')
    await fixture.whenStable()

    TestBed.inject(BottomSheetService).closeAll()
    await fixture.whenStable()

    expect(host.selected()).toBe('2026-01')
  })

  it('test_labels_follow_the_locale', async () => {
    const { picker } = await setup('es-MX')

    expect(await picker.getMonths()).toEqual(['oct', 'nov', 'dic', 'ene', 'feb'])
  })
})
