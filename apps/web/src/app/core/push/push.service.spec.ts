import { TestBed } from '@angular/core/testing'
import { SwPush } from '@angular/service-worker'
import { BehaviorSubject } from 'rxjs'
import { httpError, networkError } from '../../../testing/session-fixtures'
import { base64UrlToBytes } from '../../domain/push'
import { ConfigStore } from '../auth/config.store'
import { WINDOW } from '../platform/window.token'
import { PushApi } from './push.api'
import { PushService } from './push.service'

const KEY =
  'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
const ROTATED =
  'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM'

let endpoints = 0

/** What `pushManager.subscribe()` hands back, made with `key`. */
function aSubscription(key: string): PushSubscription {
  endpoints += 1
  const endpoint = `https://push.example.test/send/${endpoints}`
  return {
    endpoint,
    options: { applicationServerKey: base64UrlToBytes(key).buffer, userVisibleOnly: true },
    toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: 'p256', auth: 'auth' } }),
  } as unknown as PushSubscription
}

class FakeSwPush {
  isEnabled = true
  readonly subscription = new BehaviorSubject<PushSubscription | null>(null)
  readonly requestSubscription = vi.fn(async ({ serverPublicKey }: { serverPublicKey: string }) => {
    const created = aSubscription(serverPublicKey)
    this.subscription.next(created)
    return created
  })
  readonly unsubscribe = vi.fn(async () => {
    if (!this.subscription.value) {
      throw new Error('Not subscribed to push notifications.')
    }
    this.subscription.next(null)
  })
}

interface Setup {
  enabled?: boolean
  pushManager?: boolean
  permission?: NotificationPermission
  /** What the prompt answers. */
  answer?: NotificationPermission
  serverKey?: string | null
  subscribed?: PushSubscription | null
}

describe('PushService', () => {
  let sw: FakeSwPush
  let api: { subscribe: ReturnType<typeof vi.fn>; unsubscribe: ReturnType<typeof vi.fn> }
  let notification: {
    permission: NotificationPermission
    requestPermission: ReturnType<typeof vi.fn>
  }

  function setup(options: Setup = {}): PushService {
    sw = new FakeSwPush()
    sw.isEnabled = options.enabled ?? true
    sw.subscription.next(options.subscribed ?? null)
    api = { subscribe: vi.fn(async () => undefined), unsubscribe: vi.fn(async () => undefined) }
    notification = {
      permission: options.permission ?? 'default',
      requestPermission: vi.fn(async () => {
        notification.permission = options.answer ?? 'granted'
        return notification.permission
      }),
    }
    const fakeWindow = {
      Notification: notification,
      ...(options.pushManager === false ? {} : { PushManager: class {} }),
    }
    TestBed.configureTestingModule({
      providers: [
        { provide: SwPush, useValue: sw },
        { provide: WINDOW, useValue: fakeWindow },
        { provide: PushApi, useValue: api },
        {
          provide: ConfigStore,
          useValue: {
            load: async () => ({
              vapidPublicKey: options.serverKey === undefined ? KEY : options.serverKey,
            }),
          },
        },
      ],
    })
    return TestBed.inject(PushService)
  }

  it('test_a_browser_without_the_service_worker_or_the_push_api_is_unsupported', async () => {
    const withoutWorker = setup({ enabled: false })
    expect(await withoutWorker.state()).toBe('unsupported')
    expect(await withoutWorker.enable()).toBe('unsupported')

    TestBed.resetTestingModule()
    // iOS Safari outside the installed app has no PushManager.
    const iosTab = setup({ pushManager: false })
    expect(await iosTab.state()).toBe('unsupported')
    expect(notification.requestPermission).not.toHaveBeenCalled()
    expect(api.subscribe).not.toHaveBeenCalled()
  })

  it('test_without_a_server_key_push_is_unavailable', async () => {
    const push = setup({ serverKey: null })

    expect(await push.state()).toBe('unavailable')
    expect(await push.enable()).toBe('unavailable')
    expect(sw.requestSubscription).not.toHaveBeenCalled()
  })

  it('test_blocked_notifications_read_as_denied_and_ask_nothing', async () => {
    const push = setup({ permission: 'denied' })

    expect(await push.state()).toBe('denied')
    expect(await push.enable()).toBe('denied')
    expect(notification.requestPermission).not.toHaveBeenCalled()
    expect(sw.requestSubscription).not.toHaveBeenCalled()
  })

  it('test_a_device_that_never_subscribed_is_off', async () => {
    const push = setup({ permission: 'granted' })

    expect(await push.state()).toBe('off')
    expect(api.subscribe).not.toHaveBeenCalled()
  })

  it('test_without_the_permission_the_device_is_off_without_waiting_for_the_worker', async () => {
    const push = setup()
    // A worker that is not registered yet never answers.
    const waits = vi.spyOn(sw.subscription, 'pipe')

    expect(await push.state()).toBe('off')
    expect(waits).not.toHaveBeenCalled()
  })

  it('test_enabling_asks_permission_subscribes_with_the_served_key_and_registers_the_device', async () => {
    const push = setup()

    expect(await push.enable()).toBe('on')

    expect(notification.requestPermission).toHaveBeenCalledTimes(1)
    expect(sw.requestSubscription).toHaveBeenCalledWith({ serverPublicKey: KEY })
    const created = sw.subscription.value!
    expect(api.subscribe).toHaveBeenCalledWith({
      endpoint: created.endpoint,
      expirationTime: null,
      keys: { p256dh: 'p256', auth: 'auth' },
    })
  })

  it('test_a_refused_or_dismissed_prompt_subscribes_nothing', async () => {
    const refused = setup({ answer: 'denied' })
    expect(await refused.enable()).toBe('denied')
    expect(sw.requestSubscription).not.toHaveBeenCalled()

    TestBed.resetTestingModule()
    const dismissed = setup({ answer: 'default' })
    expect(await dismissed.enable()).toBe('off')
    expect(sw.requestSubscription).not.toHaveBeenCalled()
  })

  it('test_opening_settings_registers_the_existing_subscription_again', async () => {
    const existing = aSubscription(KEY)
    const push = setup({ permission: 'granted', subscribed: existing })

    expect(await push.state()).toBe('on')

    expect(api.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: existing.endpoint })
    )
    expect(sw.requestSubscription).not.toHaveBeenCalled()
  })

  it('test_a_subscription_the_api_says_is_someone_elses_is_off_until_enabled_anew', async () => {
    const previousPerson = aSubscription(KEY)
    const push = setup({ permission: 'granted', subscribed: previousPerson })
    api.subscribe.mockRejectedValueOnce(httpError(404, { code: 'E_ROW_NOT_FOUND' }))

    expect(await push.state()).toBe('off')

    api.subscribe.mockRejectedValueOnce(httpError(404, { code: 'E_ROW_NOT_FOUND' }))
    expect(await push.enable()).toBe('on')
    expect(sw.unsubscribe).toHaveBeenCalled()
    expect(sw.subscription.value?.endpoint).not.toBe(previousPerson.endpoint)
    expect(api.subscribe).toHaveBeenLastCalledWith(
      expect.objectContaining({ endpoint: sw.subscription.value!.endpoint })
    )
  })

  it('test_a_subscription_made_with_an_old_server_key_subscribes_again', async () => {
    const stale = aSubscription(ROTATED)
    const push = setup({ permission: 'granted', subscribed: stale })

    expect(await push.state()).toBe('on')

    expect(sw.unsubscribe).toHaveBeenCalledTimes(1)
    expect(sw.requestSubscription).toHaveBeenCalledWith({ serverPublicKey: KEY })
    expect(api.subscribe).toHaveBeenCalledTimes(1)
    expect(api.subscribe).not.toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: stale.endpoint })
    )
  })

  it('test_the_device_stays_on_when_the_api_cannot_be_reached', async () => {
    const push = setup({ permission: 'granted', subscribed: aSubscription(KEY) })
    api.subscribe.mockRejectedValueOnce(networkError())

    expect(await push.state()).toBe('on')
  })

  it('test_a_failed_registration_while_enabling_is_reported', async () => {
    const push = setup()
    api.subscribe.mockRejectedValueOnce(networkError())

    await expect(push.enable()).rejects.toBeDefined()
  })

  it('test_disabling_forgets_the_device_and_unsubscribes_the_browser', async () => {
    const existing = aSubscription(KEY)
    const push = setup({ permission: 'granted', subscribed: existing })

    expect(await push.disable()).toBe('off')

    expect(api.unsubscribe).toHaveBeenCalledWith(existing.endpoint)
    expect(sw.unsubscribe).toHaveBeenCalledTimes(1)
    expect(sw.subscription.value).toBeNull()
  })

  it('test_disabling_offline_still_unsubscribes_the_browser', async () => {
    const push = setup({ permission: 'granted', subscribed: aSubscription(KEY) })
    api.unsubscribe.mockRejectedValueOnce(networkError())

    expect(await push.disable()).toBe('off')
    expect(sw.subscription.value).toBeNull()
  })
})
