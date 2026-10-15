import { TestBed } from '@angular/core/testing'
import { installFakeMedia, type FakeMedia } from '../../../testing/fake-media'
import { WINDOW } from '../platform/window.token'
import { InstallService, STANDALONE_QUERY } from './install.service'

/** The event Chromium fires when the app can be installed. */
class FakeInstallPrompt extends Event {
  readonly prompt = vi.fn(async () => undefined)
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>

  constructor(outcome: 'accepted' | 'dismissed') {
    super('beforeinstallprompt', { cancelable: true })
    this.userChoice = Promise.resolve({ outcome, platform: 'web' })
  }
}

describe('InstallService', () => {
  let media: FakeMedia

  function start(userAgent = 'Mozilla/5.0 (Linux; Android 14) Chrome/130', maxTouchPoints = 5) {
    const fakeNavigator = { userAgent, maxTouchPoints, platform: 'Linux armv8l' }
    const view = new Proxy(window, {
      get(target, property) {
        if (property === 'navigator') {
          return fakeNavigator
        }
        const value = Reflect.get(target, property, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    TestBed.configureTestingModule({ providers: [{ provide: WINDOW, useValue: view }] })
    const service = TestBed.inject(InstallService)
    service.start()
    return service
  }

  beforeEach(() => {
    media = installFakeMedia(window)
  })

  afterEach(() => media.restore())

  it('test_captures_the_install_prompt_and_offers_install', () => {
    const service = start()
    expect(service.canPrompt()).toBe(false)

    const event = new FakeInstallPrompt('accepted')
    window.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(service.canPrompt()).toBe(true)
  })

  it('test_prompt_returns_the_user_choice_and_is_single_use', async () => {
    const service = start()
    const event = new FakeInstallPrompt('dismissed')
    window.dispatchEvent(event)

    await expect(service.prompt()).resolves.toBe('dismissed')

    expect(event.prompt).toHaveBeenCalledTimes(1)
    expect(service.canPrompt()).toBe(false)
    await expect(service.prompt()).resolves.toBe('unavailable')
  })

  it('test_app_installed_marks_the_app_as_installed', () => {
    const service = start()
    window.dispatchEvent(new FakeInstallPrompt('accepted'))

    window.dispatchEvent(new Event('appinstalled'))

    expect(service.installed()).toBe(true)
    expect(service.canPrompt()).toBe(false)
  })

  it('test_detects_iphone_safari_and_shows_the_share_sheet_hint', () => {
    const service = start(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'
    )

    expect(service.isIos()).toBe(true)
    expect(service.showIosHint()).toBe(true)
  })

  it('test_detects_ipad_reporting_a_desktop_user_agent', () => {
    const service = start('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', 5)

    expect(service.isIos()).toBe(true)
  })

  it('test_android_is_not_ios', () => {
    expect(start().isIos()).toBe(false)
  })

  it('test_no_hint_when_already_running_as_an_installed_app', () => {
    media.set(STANDALONE_QUERY, true)

    const service = start('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile Safari')

    expect(service.installed()).toBe(true)
    expect(service.showIosHint()).toBe(false)
  })
})
