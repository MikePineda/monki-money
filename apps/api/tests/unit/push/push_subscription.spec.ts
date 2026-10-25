import { test } from '@japa/runner'
import {
  MAX_CONSECUTIVE_FAILURES,
  isAuthSecret,
  isDeadDevice,
  isP256dhKey,
  isPushServiceEndpoint,
} from '#domain/push/push_subscription'

const P256DH =
  'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'

test.group('Push subscription: endpoint', () => {
  test('test_the_endpoints_of_the_real_push_services_are_accepted', ({ assert }) => {
    for (const endpoint of [
      'https://fcm.googleapis.com/fcm/send/dGVzdA:APA91b',
      'https://updates.push.services.mozilla.com/wpush/v2/gAAAAAB',
      'https://web.push.apple.com/QGuQyavXutnMHW',
      'https://wns2-par02p.notify.windows.com/w/?token=BQYAAAB',
      'https://FCM.googleapis.com:443/fcm/send/x',
    ]) {
      assert.isTrue(isPushServiceEndpoint(endpoint), endpoint)
    }
  })

  test('test_internal_addresses_ports_and_other_hosts_are_refused', ({ assert }) => {
    for (const endpoint of [
      'https://127.0.0.1:6379/x',
      'https://169.254.169.254/latest/meta-data/',
      'https://[::1]:5432/',
      'https://tarpit.example.test/send/1',
      'https://fcm.googleapis.com:8443/fcm/send/x',
      'http://fcm.googleapis.com/fcm/send/x',
      'https://user:pass@fcm.googleapis.com/fcm/send/x',
      'https://fcm.googleapis.com.evil.test/x',
      'https://evilfcm.googleapis.com/x',
      'https://push.apple.com.evil.test/x',
      'https://.push.apple.com/x',
      'https://10.0.0.1/x',
      'not a url',
    ]) {
      assert.isFalse(isPushServiceEndpoint(endpoint), endpoint)
    }
  })
})

test.group('Push subscription: keys', () => {
  test('test_p256dh_is_a_65_byte_uncompressed_point', ({ assert }) => {
    assert.isTrue(isP256dhKey(P256DH))
    assert.isTrue(isP256dhKey(`${P256DH}=`), 'padding is tolerated')
    assert.isFalse(isP256dhKey('A'))
    assert.isFalse(isP256dhKey(P256DH.slice(0, -4)), 'too short')
    // Same length, but a compressed-point prefix (0x02) instead of 0x04.
    assert.isFalse(isP256dhKey(`A${P256DH.slice(1)}`))
    assert.isFalse(isP256dhKey('not base64!'))
  })

  test('test_auth_is_a_16_byte_secret', ({ assert }) => {
    assert.isTrue(isAuthSecret('tBHItJI5svbpez7KI4CCXg'))
    assert.isTrue(isAuthSecret('tBHItJI5svbpez7KI4CCXg=='))
    assert.isFalse(isAuthSecret('A'))
    assert.isFalse(isAuthSecret('bmV3LWF1dGgtc2VjcmV0'), '15 bytes')
  })
})

test.group('Push subscription: dead devices', () => {
  test('test_a_device_is_dead_after_ten_failed_sends_in_a_row', ({ assert }) => {
    assert.equal(MAX_CONSECUTIVE_FAILURES, 10)
    assert.isFalse(isDeadDevice(0))
    assert.isFalse(isDeadDevice(9))
    assert.isTrue(isDeadDevice(10))
    assert.isTrue(isDeadDevice(11))
  })
})
