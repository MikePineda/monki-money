import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { FormField, form, min } from '@angular/forms/signals'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
import { AmountKeypadComponent, KEYPAD_LONG_PRESS_MS } from './amount-keypad.component'
import { AmountKeypadHarness } from './amount-keypad.harness'

@Component({
  imports: [AmountKeypadComponent, FormField],
  template: `<app-amount-keypad [formField]="entry.amountCents" />`,
})
class Host {
  readonly model = signal({ amountCents: 0 })
  readonly entry = form(this.model, (path) => {
    min(path.amountCents, 1)
  })
}

describe('AmountKeypadComponent', () => {
  async function setup() {
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [i18nTestingProviders()],
    })
    const fixture = TestBed.createComponent(Host)
    const keypad = await TestbedHarnessEnvironment.loader(fixture).getHarness(AmountKeypadHarness)
    await fixture.whenStable()
    return { fixture, keypad, host: fixture.componentInstance }
  }

  it('test_is_a_labelled_group_of_twelve_keys', async () => {
    const { keypad } = await setup()

    expect(await keypad.getGroupLabel()).toBe('Amount keypad')
    expect(await keypad.getKeyLabels()).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '00',
      '0',
      'Delete',
    ])
  })

  it('test_digits_shift_in_from_the_cents_through_signal_forms', async () => {
    const { keypad, host } = await setup()

    await keypad.press('4', '2', '5', '0')

    expect(host.model().amountCents).toBe(4250)
    expect(host.entry.amountCents().valid()).toBe(true)
  })

  it('test_double_zero_adds_whole_dollars_and_delete_removes_a_digit', async () => {
    const { keypad, host } = await setup()

    await keypad.press('5', '00', 'backspace')

    expect(host.model().amountCents).toBe(50)
  })

  it('test_announces_the_amount_after_each_key', async () => {
    const { keypad } = await setup()

    await keypad.press('4', '2', '5', '0')

    expect(await keypad.getAnnouncement()).toContain('42.50 Australian dollars')
  })

  it('test_holding_delete_clears_the_amount', async () => {
    const { keypad, host, fixture } = await setup()
    await keypad.press('9', '9')
    vi.useFakeTimers()
    const backspace = fixture.nativeElement.querySelector(
      '[data-key="backspace"]'
    ) as HTMLButtonElement

    backspace.dispatchEvent(new Event('pointerdown'))
    vi.advanceTimersByTime(KEYPAD_LONG_PRESS_MS)
    backspace.dispatchEvent(new Event('pointerup'))
    backspace.click()
    vi.useRealTimers()

    expect(host.model().amountCents).toBe(0)
  })

  it('test_a_short_press_on_delete_only_removes_one_digit', async () => {
    const { keypad, host, fixture } = await setup()
    await keypad.press('9', '9')
    vi.useFakeTimers()
    const backspace = fixture.nativeElement.querySelector(
      '[data-key="backspace"]'
    ) as HTMLButtonElement

    backspace.dispatchEvent(new Event('pointerdown'))
    vi.advanceTimersByTime(KEYPAD_LONG_PRESS_MS - 100)
    backspace.dispatchEvent(new Event('pointerup'))
    backspace.click()
    vi.useRealTimers()

    expect(host.model().amountCents).toBe(9)
  })

  it('test_physical_keyboard_digits_and_backspace_work', async () => {
    const { host, fixture } = await setup()
    const group = fixture.nativeElement.querySelector('[role="group"]') as HTMLElement

    for (const key of ['1', '2', '3', 'Backspace']) {
      group.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    }

    expect(host.model().amountCents).toBe(12)
  })
})
