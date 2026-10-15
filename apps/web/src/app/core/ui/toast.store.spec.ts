import { TestBed } from '@angular/core/testing'
import { TOAST_ACTION_MS, TOAST_DEFAULT_MS, ToastStore } from './toast.store'

describe('ToastStore', () => {
  let store: ToastStore

  beforeEach(() => {
    vi.useFakeTimers()
    store = TestBed.inject(ToastStore)
  })

  afterEach(() => vi.useRealTimers())

  it('test_shows_one_toast_with_its_message_key', () => {
    store.show({ messageKey: 'demo.saved' })

    expect(store.current()?.messageKey).toBe('demo.saved')
  })

  it('test_a_new_toast_replaces_the_visible_one', () => {
    store.show({ messageKey: 'demo.first' })
    store.show({ messageKey: 'demo.second' })

    expect(store.current()?.messageKey).toBe('demo.second')
  })

  it('test_auto_dismisses_after_five_seconds', () => {
    store.show({ messageKey: 'demo.saved' })

    vi.advanceTimersByTime(TOAST_DEFAULT_MS - 1)
    expect(store.current()).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(store.current()).toBeNull()
  })

  it('test_a_toast_with_an_action_stays_eight_seconds', () => {
    store.show({
      messageKey: 'demo.saved',
      action: { labelKey: 'demo.undo', run: () => undefined },
    })

    vi.advanceTimersByTime(TOAST_DEFAULT_MS)
    expect(store.current()).not.toBeNull()
    vi.advanceTimersByTime(TOAST_ACTION_MS - TOAST_DEFAULT_MS)
    expect(store.current()).toBeNull()
  })

  it('test_a_persistent_toast_never_auto_dismisses', () => {
    store.show({ messageKey: 'pwa.update.ready', persistent: true })

    vi.advanceTimersByTime(60_000)

    expect(store.current()?.messageKey).toBe('pwa.update.ready')
  })

  it('test_replacing_a_toast_cancels_the_old_timer', () => {
    store.show({ messageKey: 'demo.first' })
    vi.advanceTimersByTime(TOAST_DEFAULT_MS - 100)
    store.show({ messageKey: 'demo.second' })

    vi.advanceTimersByTime(200)

    expect(store.current()?.messageKey).toBe('demo.second')
  })

  it('test_running_the_action_calls_it_once_and_dismisses', () => {
    const run = vi.fn()
    store.show({ messageKey: 'demo.saved', action: { labelKey: 'demo.undo', run } })

    store.runAction()
    store.runAction()

    expect(run).toHaveBeenCalledTimes(1)
    expect(store.current()).toBeNull()
  })

  it('test_dismiss_only_closes_the_toast_it_was_given', () => {
    const first = store.show({ messageKey: 'demo.first' })
    store.show({ messageKey: 'demo.second' })

    store.dismiss(first)

    expect(store.current()?.messageKey).toBe('demo.second')
  })
})
