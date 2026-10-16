import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { Router, provideRouter } from '@angular/router'
import type { SwPush } from '@angular/service-worker'
import { BehaviorSubject, Subject } from 'rxjs'
import type { SessionStore } from '../auth/session.store'
import { startPush } from './push-startup'

@Component({ template: '' })
class Blank {}

interface Click {
  action: string
  notification: NotificationOptions & { title: string }
}

describe('startPush', () => {
  function setup(options: { enabled?: boolean; subscribed?: boolean } = {}) {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '**', component: Blank }])],
    })
    const router = TestBed.inject(Router)
    const navigate = vi.spyOn(router, 'navigateByUrl')
    const clicks = new Subject<Click>()
    const subscription = new BehaviorSubject<PushSubscription | null>(
      options.subscribed ? ({ endpoint: 'https://push.example.test/1' } as PushSubscription) : null
    )
    const unsubscribe = vi.fn(async () => subscription.next(null))
    const sw = {
      isEnabled: options.enabled ?? true,
      notificationClicks: clicks,
      subscription,
      unsubscribe,
    } as unknown as SwPush
    const beforeLogout: (() => Promise<unknown>)[] = []
    const session = {
      beforeLogout: (hook: () => Promise<unknown>) => beforeLogout.push(hook),
    } as unknown as SessionStore
    startPush({ sw, router, session })
    return { navigate, clicks, unsubscribe, beforeLogout }
  }

  it('test_a_tapped_notification_opens_its_page_in_the_running_app', () => {
    const { navigate, clicks } = setup()

    clicks.next({
      action: '',
      notification: { title: 'Your September summary is ready', data: { url: '/month/2026-09' } },
    })

    expect(navigate).toHaveBeenCalledExactlyOnceWith('/month/2026-09')
  })

  it('test_a_url_outside_the_app_or_no_url_is_ignored', () => {
    const { navigate, clicks } = setup()

    clicks.next({
      action: '',
      notification: { title: 'x', data: { url: 'https://evil.example/' } },
    })
    clicks.next({ action: '', notification: { title: 'x', data: { url: '//evil.example/add' } } })
    clicks.next({ action: '', notification: { title: 'No data' } })

    expect(navigate).not.toHaveBeenCalled()
  })

  it('test_logging_out_unsubscribes_this_browser_first', async () => {
    const { unsubscribe, beforeLogout } = setup({ subscribed: true })
    expect(beforeLogout).toHaveLength(1)

    await beforeLogout[0]()

    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('test_logging_out_of_a_browser_that_never_subscribed_does_nothing', async () => {
    const { unsubscribe, beforeLogout } = setup()

    await beforeLogout[0]()

    expect(unsubscribe).not.toHaveBeenCalled()
  })

  it('test_nothing_is_wired_without_the_service_worker', () => {
    const { clicks, beforeLogout } = setup({ enabled: false })

    expect(clicks.observed).toBe(false)
    expect(beforeLogout).toHaveLength(0)
  })
})
