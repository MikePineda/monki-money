import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { Router, provideRouter } from '@angular/router'
import type { SwPush } from '@angular/service-worker'
import { Subject } from 'rxjs'
import { followNotificationClicks } from './notification-clicks'

@Component({ template: '' })
class Blank {}

interface Click {
  action: string
  notification: NotificationOptions & { title: string }
}

describe('followNotificationClicks', () => {
  function setup(enabled = true) {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '**', component: Blank }])],
    })
    const router = TestBed.inject(Router)
    const navigate = vi.spyOn(router, 'navigateByUrl')
    const clicks = new Subject<Click>()
    const sw = { isEnabled: enabled, notificationClicks: clicks } as unknown as SwPush
    return { router, navigate, clicks, sw }
  }

  it('test_a_tapped_notification_opens_its_page_in_the_running_app', () => {
    const { router, navigate, clicks, sw } = setup()
    followNotificationClicks(sw, router)

    clicks.next({
      action: '',
      notification: { title: 'Your September summary is ready', data: { url: '/month/2026-09' } },
    })

    expect(navigate).toHaveBeenCalledExactlyOnceWith('/month/2026-09')
  })

  it('test_a_url_outside_the_app_or_no_url_is_ignored', () => {
    const { router, navigate, clicks, sw } = setup()
    followNotificationClicks(sw, router)

    clicks.next({
      action: '',
      notification: { title: 'x', data: { url: 'https://evil.example/' } },
    })
    clicks.next({ action: '', notification: { title: 'x', data: { url: '//evil.example/add' } } })
    clicks.next({ action: '', notification: { title: 'No data' } })

    expect(navigate).not.toHaveBeenCalled()
  })

  it('test_nothing_is_listened_to_without_the_service_worker', () => {
    const { router, clicks, sw } = setup(false)
    const subscribe = vi.spyOn(clicks, 'subscribe')

    followNotificationClicks(sw, router)

    expect(subscribe).not.toHaveBeenCalled()
  })
})
