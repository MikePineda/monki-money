import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { SegmentedControlComponent, type SegmentOption } from './segmented-control.component'
import { SegmentedControlHarness } from './segmented-control.harness'

type Kind = 'expense' | 'income' | 'transfer'

@Component({
  imports: [SegmentedControlComponent],
  template: `<app-segmented-control
    label="Transaction type"
    [options]="options"
    [(value)]="kind"
  />`,
})
class Host {
  readonly kind = signal<Kind>('expense')
  readonly options: SegmentOption<Kind>[] = [
    { value: 'expense', label: 'Expense' },
    { value: 'income', label: 'Income' },
    { value: 'transfer', label: 'Transfer' },
  ]
}

describe('SegmentedControlComponent', () => {
  async function setup() {
    const fixture = TestBed.createComponent(Host)
    const control = await TestbedHarnessEnvironment.loader(fixture).getHarness(
      SegmentedControlHarness.with({ label: 'Transaction type' })
    )
    return { fixture, control, host: fixture.componentInstance }
  }

  it('test_renders_a_labelled_radio_group_with_the_value_checked', async () => {
    const { control } = await setup()

    expect(await control.getOptions()).toEqual(['Expense', 'Income', 'Transfer'])
    expect(await control.getSelected()).toBe('Expense')
  })

  it('test_clicking_an_option_updates_the_model', async () => {
    const { control, host } = await setup()

    await control.select('Transfer')

    expect(host.kind()).toBe('transfer')
    expect(await control.getSelected()).toBe('Transfer')
  })

  it('test_arrow_keys_move_the_selection_and_wrap', async () => {
    const { fixture, host } = await setup()
    const checked = fixture.nativeElement.querySelector('[aria-checked="true"]') as HTMLElement

    checked.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    await fixture.whenStable()

    expect(host.kind()).toBe('transfer')
    expect(document.activeElement?.textContent?.trim()).toBe('Transfer')
  })

  it('test_only_the_selected_option_is_tabbable_and_the_thumb_follows_it', async () => {
    const { fixture, control } = await setup()
    await control.select('Income')

    const tabbable = fixture.nativeElement.querySelectorAll('[role="radio"][tabindex="0"]')
    expect(tabbable.length).toBe(1)
    expect(tabbable[0].textContent.trim()).toBe('Income')
    const host = fixture.nativeElement.querySelector('app-segmented-control') as HTMLElement
    expect(host.style.getPropertyValue('--seg-index')).toBe('1')
    expect(host.style.getPropertyValue('--seg-count')).toBe('3')
  })
})
