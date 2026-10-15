import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { ChipComponent } from './chip.component'
import { ChipHarness } from './chip.harness'

@Component({
  imports: [ChipComponent],
  template: `
    <button appChip toggle [(selected)]="groceries">Groceries</button>
    <button appChip trailing="chevron-down" (click)="opened.set(true)">NAB Everyday</button>
    <button appChip person="a">You</button>
    <button appChip pressable data-testid="add-chip" icon="plus" [selected]="cash()">Cash</button>
  `,
})
class Host {
  readonly groceries = signal(false)
  readonly cash = signal(false)
  readonly opened = signal(false)
}

describe('ChipComponent', () => {
  async function setup() {
    const fixture = TestBed.createComponent(Host)
    const loader = TestbedHarnessEnvironment.loader(fixture)
    await fixture.whenStable()
    return { fixture, loader, host: fixture.componentInstance }
  }

  it('test_filter_chip_toggles_and_shows_a_check_when_selected', async () => {
    const { loader, host } = await setup()
    const chip = await loader.getHarness(ChipHarness.with({ text: 'Groceries' }))
    expect(await chip.isPressed()).toBe(false)
    expect(await chip.hasCheckmark()).toBe(false)

    await chip.click()

    expect(host.groceries()).toBe(true)
    expect(await chip.isPressed()).toBe(true)
    expect(await chip.hasCheckmark()).toBe(true)
  })

  it('test_selected_chip_uses_the_accent_wash', async () => {
    const { fixture, loader } = await setup()
    await (await loader.getHarness(ChipHarness.with({ text: 'Groceries' }))).click()

    const element = fixture.nativeElement.querySelector('[aria-pressed="true"]') as HTMLElement
    expect(element.className).toContain('bg-accent-soft')
    expect(element.className).toContain('border-accent')
  })

  it('test_value_chip_is_not_a_toggle_and_announces_its_sheet', async () => {
    const { loader, host, fixture } = await setup()
    const chip = await loader.getHarness(ChipHarness.with({ text: 'NAB Everyday' }))

    await chip.click()

    expect(await chip.isPressed()).toBeNull()
    expect(host.opened()).toBe(true)
    const element = fixture.nativeElement.querySelector('[aria-haspopup="dialog"]') as HTMLElement
    expect(element.querySelector('[data-icon="chevron-down"]')).not.toBeNull()
  })

  it('test_a_pressable_add_chip_shows_its_icon_and_leaves_selection_to_the_consumer', async () => {
    const { fixture, host } = await setup()
    const chip = () =>
      fixture.nativeElement.querySelector('[data-testid="add-chip"]') as HTMLElement
    expect(chip().querySelector('[data-icon="plus"]')).not.toBeNull()

    expect(chip().getAttribute('aria-pressed')).toBe('false')

    chip().click()
    await fixture.whenStable()
    expect(chip().getAttribute('aria-pressed')).toBe('false')

    host.cash.set(true)
    await fixture.whenStable()

    expect(chip().getAttribute('aria-pressed')).toBe('true')
    expect(chip().querySelector('[data-icon="plus"]')).toBeNull()
    expect(chip().querySelector('[data-icon="check"]')).not.toBeNull()
  })

  it('test_person_chip_shows_the_person_dot', async () => {
    const { fixture } = await setup()

    expect(fixture.nativeElement.querySelector('app-person-dot[data-person="a"]')).not.toBeNull()
  })
})
