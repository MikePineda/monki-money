import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { BulkBarComponent } from './bulk-bar.component'

@Component({
  imports: [BulkBarComponent],
  template: `
    <app-bulk-bar
      label="Selected rows"
      clearLabel="Clear selection"
      [countLabel]="count() + ' selected'"
      (cleared)="clears.set(clears() + 1)"
    >
      <button bulkAside type="button" class="aside">Ignore</button>
      <button type="button" class="action">Category</button>
      <button type="button" class="action">Accept</button>
    </app-bulk-bar>
  `,
})
class Host {
  readonly count = signal(2)
  readonly clears = signal(0)
}

describe('BulkBarComponent', () => {
  async function setup() {
    const fixture = TestBed.createComponent(Host)
    await fixture.whenStable()
    const element = fixture.nativeElement as HTMLElement
    return { fixture, host: fixture.componentInstance, element }
  }

  it('test_is_a_named_toolbar_with_the_count_announced', async () => {
    const { element, fixture, host } = await setup()
    const bar = element.querySelector('app-bulk-bar') as HTMLElement

    expect(bar.getAttribute('role')).toBe('toolbar')
    expect(bar.getAttribute('aria-label')).toBe('Selected rows')
    expect(bar.querySelector('[aria-live="polite"]')?.textContent?.trim()).toBe('2 selected')

    host.count.set(5)
    await fixture.whenStable()
    expect(bar.querySelector('[aria-live="polite"]')?.textContent?.trim()).toBe('5 selected')
  })

  it('test_projects_the_actions_and_clears_the_selection', async () => {
    const { element, fixture, host } = await setup()

    expect([...element.querySelectorAll('.action')].map((item) => item.textContent)).toEqual([
      'Category',
      'Accept',
    ])
    // The aside action sits on the count's line, next to it.
    const countLine = element.querySelector('[aria-live="polite"]')?.parentElement
    expect(countLine?.querySelector('.aside')?.textContent).toBe('Ignore')
    element.querySelector<HTMLButtonElement>('[aria-label="Clear selection"]')?.click()
    await fixture.whenStable()

    expect(host.clears()).toBe(1)
  })
})
