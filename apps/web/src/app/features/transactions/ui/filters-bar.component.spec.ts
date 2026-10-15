import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { ChipHarness } from '../../../shared/ui/chip/chip.harness'
import { FiltersBarComponent, type FilterChipView, type FilterId } from './filters-bar.component'

@Component({
  imports: [FiltersBarComponent],
  template: `<app-filters-bar
    label="Filters"
    [chips]="chips()"
    [clearLabel]="clearLabel()"
    (opened)="opened.set($event)"
    (cleared)="cleared.set(true)"
  />`,
})
class Host {
  readonly chips = signal<FilterChipView[]>([
    { id: 'month', label: 'October', active: true },
    { id: 'account', label: 'All accounts', active: false },
    { id: 'person', label: 'Everyone', active: false },
    { id: 'category', label: 'Category', active: false },
  ])
  readonly clearLabel = signal('')
  readonly opened = signal<FilterId | null>(null)
  readonly cleared = signal(false)
}

describe('FiltersBarComponent', () => {
  async function setup() {
    const fixture = TestBed.createComponent(Host)
    await fixture.whenStable()
    return {
      fixture,
      host: fixture.componentInstance,
      loader: TestbedHarnessEnvironment.loader(fixture),
    }
  }

  it('test_month_chip_is_always_selected_and_the_others_rest', async () => {
    const { loader } = await setup()

    const month = await loader.getHarness(ChipHarness.with({ text: 'October' }))
    const account = await loader.getHarness(ChipHarness.with({ text: 'All accounts' }))

    expect(await month.hasCheckmark()).toBe(true)
    expect(await account.hasCheckmark()).toBe(false)
  })

  it('test_each_chip_opens_its_own_sheet', async () => {
    const { loader, host } = await setup()

    await (await loader.getHarness(ChipHarness.with({ text: 'Everyone' }))).click()

    expect(host.opened()).toBe('person')
  })

  it('test_an_active_filter_takes_the_selected_style_and_clear_appears', async () => {
    const { loader, host, fixture } = await setup()
    expect(
      fixture.nativeElement.querySelector('[data-testid="transactions.filter.clear"]')
    ).toBeNull()

    host.chips.update((chips) =>
      chips.map((chip) =>
        chip.id === 'account' ? { ...chip, label: 'NAB Everyday', active: true } : chip
      )
    )
    host.clearLabel.set('Clear')
    await fixture.whenStable()

    const account = await loader.getHarness(ChipHarness.with({ text: 'NAB Everyday' }))
    expect(await account.hasCheckmark()).toBe(true)
    const clear = fixture.nativeElement.querySelector(
      '[data-testid="transactions.filter.clear"]'
    ) as HTMLButtonElement
    clear.click()
    expect(host.cleared()).toBe(true)
  })
})
