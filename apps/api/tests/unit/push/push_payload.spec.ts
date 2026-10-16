import { test } from '@japa/runner'
import { vapidSubject } from '#domain/push/vapid_subject'
import { angularPushMessage, isAppPath } from '#domain/push/push_payload'

test.group('Push payload', () => {
  test('test_the_message_is_what_the_angular_service_worker_shows', ({ assert }) => {
    const message = angularPushMessage({
      title: 'Your September summary is ready',
      body: 'See how September went.',
      url: '/month/2026-09',
      tag: 'summary-2026-09',
    })

    assert.deepEqual(message, {
      notification: {
        title: 'Your September summary is ready',
        body: 'See how September went.',
        tag: 'summary-2026-09',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-maskable-192.png',
        data: {
          url: '/month/2026-09',
          // A tap focuses the open app (which routes to `url` itself) or opens it at `url`.
          onActionClick: {
            default: { operation: 'focusLastFocusedOrOpen', url: '/month/2026-09' },
          },
        },
      },
    })
  })

  test('test_only_paths_inside_the_app_are_links', ({ assert }) => {
    assert.isTrue(isAppPath('/add'))
    assert.isTrue(isAppPath('/month/2026-09'))
    assert.isFalse(isAppPath('https://example.test/add'))
    assert.isFalse(isAppPath('//example.test/add'))
    assert.isFalse(isAppPath('/\\example.test'))
    assert.isFalse(isAppPath('add'))
    assert.throws(() => angularPushMessage({ title: 't', body: 'b', url: '//evil', tag: 'x' }))
  })
})

test.group('VAPID subject', () => {
  test('test_the_configured_subject_wins', ({ assert }) => {
    assert.equal(
      vapidSubject('mailto:ops@example.test', 'https://app.example.test'),
      'mailto:ops@example.test'
    )
  })

  test('test_an_https_app_url_is_the_subject_by_default', ({ assert }) => {
    assert.equal(vapidSubject(undefined, 'https://app.example.test'), 'https://app.example.test')
    assert.equal(vapidSubject('', 'https://app.example.test/'), 'https://app.example.test')
  })

  test('test_a_plain_http_app_url_becomes_a_mailto_on_its_host', ({ assert }) => {
    // Push services only take https: or mailto: subjects (development runs on http).
    assert.equal(vapidSubject(undefined, 'http://localhost:3333'), 'mailto:webpush@localhost')
  })
})
