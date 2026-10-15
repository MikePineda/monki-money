import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { EmptyStateComponent } from './empty-state.component'

@Component({
  imports: [EmptyStateComponent],
  template: `
    <app-empty-state icon="inbox" title="No transactions in October yet." body="Add the first one.">
      <button type="button">Add transaction</button>
    </app-empty-state>
  `,
})
class Host {}

describe('EmptyStateComponent', () => {
  it('test_states_the_fact_the_next_step_and_offers_one_action', async () => {
    const fixture = TestBed.createComponent(Host)
    await fixture.whenStable()
    const element = fixture.nativeElement as HTMLElement

    expect(element.querySelector('h2')?.textContent).toBe('No transactions in October yet.')
    expect(element.querySelector('p')?.textContent).toBe('Add the first one.')
    expect(element.querySelector('svg[data-icon="inbox"]')?.getAttribute('width')).toBe('24')
    expect(element.querySelectorAll('button').length).toBe(1)
  })
})
