import { TestBed } from '@angular/core/testing'
import { ProgressTrackComponent } from './progress-track.component'

describe('ProgressTrackComponent', () => {
  async function render(inputs: Record<string, unknown>) {
    const fixture = TestBed.createComponent(ProgressTrackComponent)
    for (const [name, value] of Object.entries({ label: 'Upload', ...inputs })) {
      fixture.componentRef.setInput(name, value)
    }
    await fixture.whenStable()
    return fixture.nativeElement as HTMLElement
  }

  it('test_task_progress_is_an_ink_fill_with_the_percentage_announced', async () => {
    const host = await render({ value: 0.35 })
    const fill = host.querySelector('span') as HTMLElement

    expect(host.getAttribute('role')).toBe('progressbar')
    expect(host.getAttribute('aria-valuenow')).toBe('35')
    expect(fill.style.width).toBe('35%')
    expect(fill.className).toContain('bg-ink-1')
  })

  it('test_null_value_is_indeterminate', async () => {
    const host = await render({ value: null })

    expect(host.hasAttribute('aria-valuenow')).toBe(false)
    expect(host.querySelector('.animate-indeterminate')).not.toBeNull()
  })

  it('test_meter_turns_serious_past_ninety_and_critical_past_one_hundred_percent', async () => {
    expect(
      (await render({ variant: 'meter', value: 0.5 })).querySelector('.bg-mark-neutral')
    ).not.toBeNull()
    expect(
      (await render({ variant: 'meter', value: 0.92 })).querySelector('.bg-status-serious')
    ).not.toBeNull()
    const over = await render({ variant: 'meter', value: 1.2 })
    expect(over.querySelector('.bg-status-critical')).not.toBeNull()
    expect((over.querySelector('span') as HTMLElement).style.width).toBe('100%')
  })

  it('test_steps_fill_the_completed_segments', async () => {
    const host = await render({ steps: 4, current: 2 })

    expect(host.querySelectorAll('[data-done="true"]').length).toBe(2)
    expect(host.querySelectorAll('[data-done="false"]').length).toBe(2)
    expect(host.getAttribute('aria-valuemax')).toBe('4')
    expect(host.getAttribute('aria-valuenow')).toBe('2')
  })
})
