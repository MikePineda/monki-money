import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
import { ListRowComponent } from './list-row.component'
import { ListRowHarness } from './list-row.harness'

@Component({
  imports: [ListRowComponent],
  template: `
    <div role="list">
      <app-list-row
        icon="shopping-cart"
        title="Riverside Grocer"
        [meta]="['Groceries', 'NAB Everyday']"
        person="b"
        [amountCents]="14265"
        kind="expense"
        interactive
        (pressed)="opened.set(true)"
      />
      <app-list-row
        icon="arrow-left-right"
        title="To savings"
        [amountCents]="50000"
        kind="transfer"
      />
    </div>
  `,
})
class Host {
  readonly opened = signal(false)
}

describe('ListRowComponent', () => {
  async function setup() {
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [i18nTestingProviders()],
    })
    const fixture = TestBed.createComponent(Host)
    const loader = TestbedHarnessEnvironment.loader(fixture)
    return { fixture, loader, host: fixture.componentInstance }
  }

  it('test_shows_merchant_meta_person_and_signed_amount', async () => {
    const { loader, fixture } = await setup()
    const row = await loader.getHarness(ListRowHarness.with({ title: 'Riverside Grocer' }))

    expect(await row.getMeta()).toBe('Groceries · NAB Everyday')
    expect(await row.getAmount()).toBe('−$142.65')
    expect(fixture.nativeElement.querySelector('app-person-dot[data-person="b"]')).not.toBeNull()
  })

  it('test_interactive_row_is_a_button_that_emits_pressed', async () => {
    const { loader, host } = await setup()
    const row = await loader.getHarness(ListRowHarness.with({ title: 'Riverside Grocer' }))

    await row.click()

    expect(host.opened()).toBe(true)
  })

  it('test_static_row_is_a_list_item_without_a_button', async () => {
    const { loader } = await setup()
    const row = await loader.getHarness(ListRowHarness.with({ title: 'To savings' }))

    expect(await row.isInteractive()).toBe(false)
    expect(await row.getMeta()).toBeNull()
    expect(await (await row.host()).getAttribute('role')).toBe('listitem')
  })
})
