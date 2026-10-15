import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { LONG_PRESS_MS, LongPressDirective } from './long-press.directive'

@Component({
  imports: [LongPressDirective],
  template: `<button
    type="button"
    (appLongPress)="held.set(held() + 1)"
    (click)="clicks.set(clicks() + 1)"
  >
    Row
  </button>`,
})
class Host {
  readonly held = signal(0)
  readonly clicks = signal(0)
}

function pointer(type: string, init: { x?: number; y?: number } = {}): Event {
  // jsdom has no PointerEvent; a MouseEvent carries the same coordinates.
  return new MouseEvent(type, { bubbles: true, clientX: init.x ?? 0, clientY: init.y ?? 0 })
}

describe('LongPressDirective', () => {
  afterEach(() => vi.useRealTimers())

  async function setup() {
    const fixture = TestBed.createComponent(Host)
    await fixture.whenStable()
    // After the first render: whenStable() waits on real timers.
    vi.useFakeTimers()
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement
    return { host: fixture.componentInstance, button }
  }

  it('test_holding_fires_once_and_swallows_the_click_that_follows', async () => {
    const { host, button } = await setup()

    button.dispatchEvent(pointer('pointerdown'))
    vi.advanceTimersByTime(LONG_PRESS_MS)
    button.dispatchEvent(pointer('pointerup'))
    button.click()

    expect(host.held()).toBe(1)
    expect(host.clicks()).toBe(0)
  })

  it('test_a_short_tap_is_a_plain_click', async () => {
    const { host, button } = await setup()

    button.dispatchEvent(pointer('pointerdown'))
    vi.advanceTimersByTime(LONG_PRESS_MS - 100)
    button.dispatchEvent(pointer('pointerup'))
    button.click()

    expect(host.held()).toBe(0)
    expect(host.clicks()).toBe(1)
  })

  it('test_moving_the_finger_cancels_the_hold', async () => {
    const { host, button } = await setup()

    button.dispatchEvent(pointer('pointerdown', { x: 10, y: 10 }))
    button.dispatchEvent(pointer('pointermove', { x: 10, y: 40 }))
    vi.advanceTimersByTime(LONG_PRESS_MS)

    expect(host.held()).toBe(0)
  })

  it('test_the_context_menu_key_or_right_click_opens_the_actions_too', async () => {
    const { host, button } = await setup()

    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    button.dispatchEvent(event)

    expect(host.held()).toBe(1)
    expect(event.defaultPrevented).toBe(true)
  })
})
