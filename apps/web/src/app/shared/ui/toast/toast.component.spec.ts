import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed'
import { ToastComponent } from './toast.component'
import { ToastHarness } from './toast.harness'

@Component({
  imports: [ToastComponent],
  template: `
    <app-toast
      message="Expense saved."
      status="good"
      actionLabel="Undo"
      dismissLabel="Dismiss"
      (action)="undone.set(true)"
      (dismissed)="closed.set(true)"
    />
  `,
})
class Host {
  readonly undone = signal(false)
  readonly closed = signal(false)
}

describe('ToastComponent', () => {
  async function setup() {
    const fixture = TestBed.createComponent(Host)
    const toast = await TestbedHarnessEnvironment.loader(fixture).getHarness(ToastHarness)
    return { toast, host: fixture.componentInstance, fixture }
  }

  it('test_shows_the_message_with_a_status_icon', async () => {
    const { toast } = await setup()

    expect(await toast.getMessage()).toBe('Expense saved.')
    expect(await toast.getStatusIcon()).toBe('circle-check')
  })

  it('test_action_and_dismiss_are_reported_to_the_owner', async () => {
    const { toast, host } = await setup()

    expect(await toast.getActionLabel()).toBe('Undo')
    await toast.runAction()
    await toast.dismiss()

    expect(host.undone()).toBe(true)
    expect(host.closed()).toBe(true)
  })

  it('test_is_a_raised_level_two_surface', async () => {
    const { fixture } = await setup()
    const element = fixture.nativeElement.querySelector('app-toast') as HTMLElement

    expect(element.className).toContain('shadow-2')
    expect(element.className).toContain('rounded-lg')
  })
})
