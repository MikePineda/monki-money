import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { ButtonComponent, type ButtonVariant } from './button.component'
import { ButtonHarness } from './button.harness'

@Component({
  imports: [ButtonComponent],
  template: `
    <button
      appButton
      type="button"
      [variant]="variant()"
      [loading]="loading()"
      (click)="clicks.update((n) => n + 1)"
    >
      Save expense
    </button>
    <button appButton type="button" variant="secondary" disabled>Disabled</button>
  `,
})
class Host {
  readonly variant = signal<ButtonVariant>('primary')
  readonly loading = signal(false)
  readonly clicks = signal(0)
}

describe('ButtonComponent', () => {
  async function setup() {
    const fixture = TestBed.createComponent(Host)
    const loader = TestbedHarnessEnvironment.loader(fixture)
    await fixture.whenStable()
    const button = await loader.getHarness(ButtonHarness.with({ text: 'Save expense' }))
    return { fixture, loader, button, host: fixture.componentInstance }
  }

  it('test_primary_is_ink_filled_never_accent', async () => {
    const { fixture } = await setup()
    const element = fixture.nativeElement.querySelector('[data-variant="primary"]') as HTMLElement

    expect(element.className).toContain('bg-ink-1')
    expect(element.className).toContain('text-surface-0')
    expect(element.className).not.toContain('accent')
  })

  it('test_click_reaches_the_consumer', async () => {
    const { button, host } = await setup()

    await button.click()

    expect(host.clicks()).toBe(1)
  })

  it('test_loading_keeps_the_label_shows_a_spinner_and_swallows_clicks', async () => {
    const { button, host, fixture } = await setup()
    host.loading.set(true)
    await fixture.whenStable()

    await button.click()

    expect(await button.isLoading()).toBe(true)
    expect(await button.getText()).toBe('Save expense')
    expect(await button.hasIcon('loader-circle')).toBe(true)
    expect(host.clicks()).toBe(0)
  })

  it('test_destructive_shows_the_trash_icon_and_critical_outline', async () => {
    const { button, host, fixture } = await setup()
    host.variant.set('destructive')
    await fixture.whenStable()

    expect(await button.hasIcon('trash-2')).toBe(true)
    const element = fixture.nativeElement.querySelector(
      '[data-variant="destructive"]'
    ) as HTMLElement
    expect(element.className).toContain('border-status-critical')
  })

  it('test_native_disabled_is_respected', async () => {
    const { loader } = await setup()
    const disabled = await loader.getHarness(ButtonHarness.with({ text: 'Disabled' }))

    expect(await disabled.isDisabled()).toBe(true)
  })
})
