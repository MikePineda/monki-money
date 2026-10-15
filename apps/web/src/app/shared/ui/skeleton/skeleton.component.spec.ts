import { TestBed } from '@angular/core/testing'
import { SkeletonComponent } from './skeleton.component'

describe('SkeletonComponent', () => {
  it('test_is_hidden_from_assistive_tech_and_sized_like_its_content', async () => {
    const fixture = TestBed.createComponent(SkeletonComponent)
    fixture.componentRef.setInput('width', '120px')
    fixture.componentRef.setInput('height', '24px')
    await fixture.whenStable()
    const host = fixture.nativeElement as HTMLElement

    expect(host.getAttribute('aria-hidden')).toBe('true')
    expect(host.style.width).toBe('120px')
    expect(host.style.height).toBe('24px')
    expect(host.className).toContain('animate-skeleton')
    expect(host.className).toContain('bg-surface-2')
  })
})
