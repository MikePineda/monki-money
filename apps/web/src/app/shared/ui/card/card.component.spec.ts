import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { CardComponent } from './card.component'

@Component({
  imports: [CardComponent],
  template: `<app-card eyebrow="Insight"><p>Groceries are 14% under your average.</p></app-card>`,
})
class Host {}

describe('CardComponent', () => {
  it('test_is_a_flat_raised_surface_with_an_optional_eyebrow', async () => {
    const fixture = TestBed.createComponent(Host)
    await fixture.whenStable()
    const card = fixture.nativeElement.querySelector('app-card') as HTMLElement

    expect(card.className).toContain('bg-surface-1')
    expect(card.className).toContain('border-line')
    expect(card.className).toContain('rounded-lg')
    expect(card.className).not.toContain('shadow')
    expect(card.querySelector('.text-eyebrow')?.textContent).toBe('Insight')
    expect(card.querySelector('p:last-child')?.textContent).toContain('14% under')
  })
})
