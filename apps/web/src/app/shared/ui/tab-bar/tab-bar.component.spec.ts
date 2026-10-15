import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { Router, provideRouter } from '@angular/router'
import { TabBarComponent, type TabItem } from './tab-bar.component'
import { TabBarHarness } from './tab-bar.harness'

@Component({ template: '' })
class Blank {}

@Component({
  imports: [TabBarComponent],
  template: `<app-tab-bar label="Main" addLabel="Add transaction" [tabs]="tabs" [addAfter]="1" />`,
})
class Host {
  readonly tabs: TabItem[] = [
    { path: '/month', icon: 'calendar', label: 'Month' },
    { path: '/transactions', icon: 'list', label: 'Transactions' },
    { path: '/more', icon: 'ellipsis', label: 'More' },
  ]
}

describe('TabBarComponent', () => {
  async function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'month', component: Blank },
          { path: 'transactions', component: Blank },
          { path: 'more', component: Blank },
          { path: 'add', component: Blank },
        ]),
      ],
    })
    const fixture = TestBed.createComponent(Host)
    await TestBed.inject(Router).navigateByUrl('/month')
    const bar = await TestbedHarnessEnvironment.loader(fixture).getHarness(TabBarHarness)
    return { fixture, bar }
  }

  it('test_is_a_labelled_navigation_with_the_add_button_after_the_second_tab', async () => {
    const { bar, fixture } = await setup()

    expect(await bar.getNavLabel()).toBe('Main')
    expect(await bar.getTabLabels()).toEqual(['Month', 'Transactions', 'More'])
    expect(await bar.getAddLabel()).toBe('Add transaction')
    const items = Array.from(fixture.nativeElement.querySelectorAll('li')) as HTMLElement[]
    expect(items[2].querySelector('[data-testid="shell.add"]')).not.toBeNull()
  })

  it('test_marks_the_active_tab_with_aria_current_and_the_accent', async () => {
    const { bar, fixture } = await setup()

    expect(await bar.getActiveTab()).toBe('Month')
    const active = fixture.nativeElement.querySelector('[aria-current="page"]') as HTMLElement
    expect(active.className).toContain('aria-[current=page]:text-accent')
  })

  it('test_navigates_between_tabs_and_to_add', async () => {
    const { bar, fixture } = await setup()

    await bar.clickTab('Transactions')
    await fixture.whenStable()
    expect(TestBed.inject(Router).url).toBe('/transactions')
    expect(await bar.getActiveTab()).toBe('Transactions')

    await bar.clickAdd()
    await fixture.whenStable()
    expect(TestBed.inject(Router).url).toBe('/add')
  })

  it('test_add_button_is_ink_not_accent', async () => {
    const { fixture } = await setup()
    const add = fixture.nativeElement.querySelector('[data-testid="shell.add"]') as HTMLElement

    expect(add.className).toContain('bg-ink-1')
    expect(add.className).not.toContain('accent')
  })
})
