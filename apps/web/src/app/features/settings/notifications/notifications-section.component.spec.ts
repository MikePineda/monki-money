import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import type { NotificationSettings } from '@monkimoney/shared'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
import { aHousehold, networkError } from '../../../../testing/session-fixtures'
import { SessionStore } from '../../../core/auth/session.store'
import { PushApi } from '../../../core/push/push.api'
import { PushService, type PushState } from '../../../core/push/push.service'
import { InstallService } from '../../../core/pwa/install.service'
import { ToastStore } from '../../../core/ui/toast.store'
import { NotificationsSectionComponent } from './notifications-section.component'

const DEFAULTS: NotificationSettings = {
  summaryReady: true,
  dailyReminder: false,
  reminderTime: '20:00',
}

const SETTLED_STATES = ['unsupported', 'unavailable', 'denied', 'enable', 'enabled']
  .map((state) => `[data-testid="notifications.${state}"]`)
  .join(', ')

interface Render {
  state?: PushState
  /** What the permission prompt and subscription end in. */
  enabled?: PushState | Error
  settings?: NotificationSettings
  iosSafari?: boolean
  lang?: 'en' | 'es'
}

describe('NotificationsSectionComponent', () => {
  let push: {
    state: ReturnType<typeof vi.fn>
    enable: ReturnType<typeof vi.fn>
    disable: ReturnType<typeof vi.fn>
  }
  let api: { settings: ReturnType<typeof vi.fn>; updateSettings: ReturnType<typeof vi.fn> }

  async function render(options: Render = {}) {
    let saved = options.settings ?? DEFAULTS
    push = {
      state: vi.fn(async () => options.state ?? 'off'),
      enable: vi.fn(async () => {
        if (options.enabled instanceof Error) {
          throw options.enabled
        }
        return options.enabled ?? 'on'
      }),
      disable: vi.fn(async () => 'off'),
    }
    api = {
      settings: vi.fn(async () => saved),
      updateSettings: vi.fn(async (changes: Partial<NotificationSettings>) => {
        saved = { ...saved, ...changes }
        return saved
      }),
    }
    TestBed.configureTestingModule({
      imports: [i18nTesting({ lang: options.lang })],
      providers: [
        i18nTestingProviders(),
        { provide: PushService, useValue: push },
        { provide: PushApi, useValue: api },
        {
          provide: SessionStore,
          useValue: { household: signal(aHousehold({ timezone: 'Australia/Brisbane' })) },
        },
        { provide: InstallService, useValue: { showIosHint: signal(options.iosSafari ?? false) } },
      ],
    })
    const fixture = TestBed.createComponent(NotificationsSectionComponent)
    const root = fixture.nativeElement as HTMLElement
    // Copy from the first frame (every scope is preloaded), then one settled state.
    await vi.waitFor(() => {
      expect(root.textContent).toContain(options.lang === 'es' ? 'Notificaciones' : 'Notifications')
      expect(root.querySelector(SETTLED_STATES)).not.toBeNull()
    })
    await fixture.whenStable()
    return { fixture, root }
  }

  function text(root: ParentNode, testId: string): string {
    return (
      root.querySelector(`[data-testid="${testId}"]`)?.textContent?.replace(/\s+/g, ' ').trim() ??
      ''
    )
  }

  function click(root: HTMLElement, testId: string): void {
    const target = root.querySelector<HTMLElement>(`[data-testid="${testId}"]`)
    if (!target) {
      throw new Error(`No ${testId}`)
    }
    target.click()
  }

  function toggle(root: HTMLElement, testId: string): void {
    const input = root.querySelector<HTMLInputElement>(`[data-testid="${testId}"] input`)
    if (!input) {
      throw new Error(`No checkbox ${testId}`)
    }
    input.click()
  }

  it('test_an_unsupported_browser_says_so_and_offers_nothing', async () => {
    const { root } = await render({ state: 'unsupported' })

    expect(text(root, 'notifications.unsupported')).toBe('This browser cannot show notifications.')
    expect(root.querySelector('[data-testid="notifications.enable"]')).toBeNull()
    expect(api.settings).not.toHaveBeenCalled()
  })

  it('test_safari_on_an_iphone_explains_that_notifications_need_the_installed_app', async () => {
    const { root } = await render({ state: 'unsupported', iosSafari: true })

    expect(text(root, 'notifications.unsupported')).toContain(
      'notifications only work in the installed app'
    )
    expect(text(root, 'notifications.unsupported')).toContain('Add to Home Screen')
  })

  it('test_blocked_notifications_say_where_to_allow_them', async () => {
    const { root } = await render({ state: 'denied' })

    expect(text(root, 'notifications.denied')).toBe(
      'Notifications are blocked for monkimoney. Allow them in your browser or device settings, then come back here.'
    )
    expect(root.querySelector('[data-testid="notifications.enable"]')).toBeNull()
  })

  it('test_without_a_server_key_notifications_are_unavailable', async () => {
    const { root } = await render({ state: 'unavailable' })

    expect(text(root, 'notifications.unavailable')).toBe(
      'Notifications are not available right now.'
    )
  })

  it('test_off_explains_the_ios_requirement_and_turning_on_shows_the_preferences', async () => {
    const { fixture, root } = await render({ state: 'off' })
    expect(text(root, 'notifications.iosHint')).toContain('add monkimoney to your Home Screen')
    expect(root.querySelector('[data-testid="notifications.summary"]')).toBeNull()

    click(root, 'notifications.enable')
    await vi.waitFor(() => expect(text(root, 'notifications.enabled')).toBe('On for this device.'))
    await fixture.whenStable()

    expect(push.enable).toHaveBeenCalledTimes(1)
    const summary = root.querySelector<HTMLInputElement>(
      '[data-testid="notifications.summary"] input'
    )
    const reminder = root.querySelector<HTMLInputElement>(
      '[data-testid="notifications.reminder"] input'
    )
    expect(summary?.checked).toBe(true)
    expect(reminder?.checked).toBe(false)
    expect(root.querySelector('[data-testid="notifications.reminderTime"]')).toBeNull()
  })

  it('test_a_refused_prompt_shows_the_blocked_message', async () => {
    const { root } = await render({ state: 'off', enabled: 'denied' })

    click(root, 'notifications.enable')

    await vi.waitFor(() => expect(text(root, 'notifications.denied')).not.toBe(''))
    expect(api.settings).not.toHaveBeenCalled()
  })

  it('test_a_failed_subscription_says_so_and_keeps_the_button', async () => {
    const { fixture, root } = await render({ state: 'off', enabled: networkError() })

    click(root, 'notifications.enable')
    await vi.waitFor(() =>
      expect(TestBed.inject(ToastStore).current()?.messageKey).toBe('notifications.enableFailed')
    )
    await fixture.whenStable()

    expect(TestBed.inject(ToastStore).current()?.status).toBe('critical')
    expect(root.querySelector('[data-testid="notifications.enable"]')).not.toBeNull()
  })

  it('test_enabled_shows_the_saved_preferences_with_the_reminder_time_and_time_zone', async () => {
    const { root } = await render({
      state: 'on',
      settings: { summaryReady: false, dailyReminder: true, reminderTime: '21:30' },
    })

    expect(
      root.querySelector<HTMLInputElement>('[data-testid="notifications.summary"] input')?.checked
    ).toBe(false)
    const time = root.querySelector<HTMLInputElement>('[data-testid="notifications.reminderTime"]')
    expect(time?.value).toBe('21:30')
    expect(root.textContent).toContain('Time zone: Australia/Brisbane')
  })

  it('test_a_switch_saves_at_once_and_the_reminder_time_appears', async () => {
    const { fixture, root } = await render({ state: 'on' })

    toggle(root, 'notifications.reminder')
    await vi.waitFor(() =>
      expect(root.querySelector('[data-testid="notifications.reminderTime"]')).not.toBeNull()
    )
    await fixture.whenStable()

    expect(api.updateSettings).toHaveBeenCalledWith({ dailyReminder: true })
  })

  it('test_a_new_reminder_time_is_saved', async () => {
    const { fixture, root } = await render({
      state: 'on',
      settings: { ...DEFAULTS, dailyReminder: true },
    })
    const time = root.querySelector<HTMLInputElement>('[data-testid="notifications.reminderTime"]')!

    time.value = '19:45'
    time.dispatchEvent(new Event('change'))
    await fixture.whenStable()

    expect(api.updateSettings).toHaveBeenCalledWith({ reminderTime: '19:45' })
    // An unchanged or cleared value saves nothing.
    time.value = ''
    time.dispatchEvent(new Event('change'))
    expect(api.updateSettings).toHaveBeenCalledTimes(1)
  })

  it('test_the_reminder_time_goes_up_to_23_30', async () => {
    const { fixture, root } = await render({
      state: 'on',
      settings: { ...DEFAULTS, dailyReminder: true },
    })
    const time = root.querySelector<HTMLInputElement>('[data-testid="notifications.reminderTime"]')!
    expect(time.max).toBe('23:30')

    // A later time could miss the last check before midnight: it becomes 23:30.
    time.value = '23:50'
    time.dispatchEvent(new Event('change'))
    await fixture.whenStable()

    expect(api.updateSettings).toHaveBeenCalledExactlyOnceWith({ reminderTime: '23:30' })
    expect(time.value).toBe('23:30')
  })

  it('test_a_refused_change_rolls_back_and_says_why', async () => {
    const { fixture, root } = await render({ state: 'on' })
    api.updateSettings.mockRejectedValueOnce(networkError())

    toggle(root, 'notifications.summary')
    await vi.waitFor(() =>
      expect(TestBed.inject(ToastStore).current()?.messageKey).toBe('errors.offline')
    )
    await fixture.whenStable()

    expect(
      root.querySelector<HTMLInputElement>('[data-testid="notifications.summary"] input')?.checked
    ).toBe(true)
  })

  it('test_turning_off_on_this_device_goes_back_to_the_enable_button', async () => {
    const { fixture, root } = await render({ state: 'on' })

    click(root, 'notifications.disable')
    await vi.waitFor(() =>
      expect(root.querySelector('[data-testid="notifications.enable"]')).not.toBeNull()
    )
    await fixture.whenStable()

    expect(push.disable).toHaveBeenCalledTimes(1)
    expect(root.querySelector('[data-testid="notifications.summary"]')).toBeNull()
  })

  it('test_the_section_speaks_spanish', async () => {
    const { root } = await render({ state: 'on', lang: 'es' })

    expect(text(root, 'settings.notifications')).toContain('Notificaciones')
    expect(text(root, 'notifications.summary')).toContain('Resumen del mes listo')
    expect(text(root, 'notifications.disable')).toBe('Desactivar en este dispositivo')
  })
})
