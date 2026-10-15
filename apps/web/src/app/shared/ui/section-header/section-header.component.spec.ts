import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { SectionHeaderComponent } from './section-header.component'

@Component({
  imports: [SectionHeaderComponent],
  template: `
    <app-section-header title="Spend by category" eyebrow="October" subtitle="1–15 Oct">
      <button sectionAction type="button">Table</button>
    </app-section-header>
  `,
})
class Host {}

describe('SectionHeaderComponent', () => {
  it('test_renders_eyebrow_heading_caption_and_the_projected_action', async () => {
    const fixture = TestBed.createComponent(Host)
    await fixture.whenStable()
    const element = fixture.nativeElement as HTMLElement

    expect(element.querySelector('h2')?.textContent).toBe('Spend by category')
    expect(element.querySelector('.text-eyebrow')?.textContent).toBe('October')
    expect(element.querySelector('.text-caption')?.textContent).toBe('1–15 Oct')
    expect(element.querySelector('button[sectionAction]')).not.toBeNull()
  })
})
