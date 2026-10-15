import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import type { FeedbackStatus } from '../status-icon'
import { BannerComponent } from './banner.component'

@Component({
  imports: [BannerComponent],
  template: `
    <app-banner
      message="You are offline."
      icon="wifi-off"
      [status]="status()"
      actionLabel="Retry"
      dismissLabel="Dismiss"
      (action)="retried.set(true)"
      (dismissed)="closed.set(true)"
    />
  `,
})
class Host {
  readonly status = signal<FeedbackStatus | null>(null)
  readonly retried = signal(false)
  readonly closed = signal(false)
}

describe('BannerComponent', () => {
  async function setup() {
    const fixture = TestBed.createComponent(Host)
    await fixture.whenStable()
    const banner = fixture.nativeElement.querySelector('app-banner') as HTMLElement
    return { fixture, banner, host: fixture.componentInstance }
  }

  it('test_neutral_banner_uses_its_icon_in_ink_and_is_a_status_region', async () => {
    const { banner } = await setup()

    expect(banner.getAttribute('role')).toBe('status')
    expect(banner.querySelector('[data-icon="wifi-off"]')).not.toBeNull()
    expect(banner.querySelector('app-icon')?.className).toContain('text-ink-2')
    expect(banner.className).toContain('bg-surface-2')
  })

  it('test_status_banner_swaps_in_the_status_icon_and_alerts_when_serious', async () => {
    const { banner, fixture, host } = await setup()
    host.status.set('critical')
    await fixture.whenStable()

    expect(banner.getAttribute('role')).toBe('alert')
    expect(banner.querySelector('[data-icon="circle-alert"]')).not.toBeNull()
    expect(banner.querySelector('app-icon')?.className).toContain('text-status-critical')
  })

  it('test_action_and_close_are_reported', async () => {
    const { banner, host } = await setup()
    const [action, close] = Array.from(banner.querySelectorAll('button'))

    action.click()
    close.click()

    expect(close.getAttribute('aria-label')).toBe('Dismiss')
    expect(host.retried()).toBe(true)
    expect(host.closed()).toBe(true)
  })
})
