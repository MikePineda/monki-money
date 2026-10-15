import { test } from '@japa/runner'
import { clientIp } from '#services/http/client_ip'
import { throttleKey } from '#services/auth/throttles'

/**
 * Fake context: `peer` is the TCP peer (Traefik in production), `ip` what
 * `request.ip()` resolved through the trusted-proxy rules.
 */
function ctxWith(headers: Record<string, string>, peer: string, ip = peer) {
  return {
    request: {
      header: (name: string) => headers[name.toLowerCase()],
      ip: () => ip,
      request: { socket: { remoteAddress: peer } },
    },
  }
}

test.group('clientIp', () => {
  test('test_cf_connecting_ip_is_used_when_the_peer_is_the_local_proxy', ({ assert }) => {
    // Traefik on the Docker network (private) or loopback (local, tests).
    const viaTraefik = ctxWith(
      { 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '6.6.6.6' },
      '10.0.1.5',
      '172.70.1.1'
    )
    assert.equal(clientIp(viaTraefik), '203.0.113.7')
    assert.equal(
      clientIp(ctxWith({ 'cf-connecting-ip': '203.0.113.7' }, '127.0.0.1')),
      '203.0.113.7'
    )
    assert.equal(
      clientIp(ctxWith({ 'cf-connecting-ip': '203.0.113.7' }, '::ffff:172.18.0.4')),
      '203.0.113.7'
    )
  })

  test('test_cf_connecting_ip_from_a_direct_public_peer_is_ignored', ({ assert }) => {
    const direct = ctxWith({ 'cf-connecting-ip': '198.51.100.99' }, '198.51.100.20')

    assert.equal(clientIp(direct), '198.51.100.20')
  })

  test('test_direct_request_with_spoofed_header_does_not_get_a_fresh_limiter_bucket', ({
    assert,
  }) => {
    const first = ctxWith({ 'cf-connecting-ip': '1.1.1.1' }, '198.51.100.20')
    const second = ctxWith({ 'cf-connecting-ip': '2.2.2.2' }, '198.51.100.20')

    assert.equal(
      throttleKey('login', clientIp(first), 'user@example.test'),
      throttleKey('login', clientIp(second), 'user@example.test')
    )
  })

  test('test_falls_back_to_the_trusted_proxy_resolution_without_cloudflare', ({ assert }) => {
    assert.equal(clientIp(ctxWith({}, '10.0.1.5', '198.51.100.20')), '198.51.100.20')
  })

  test('test_blank_cf_header_is_ignored', ({ assert }) => {
    assert.equal(
      clientIp(ctxWith({ 'cf-connecting-ip': '  ' }, '127.0.0.1', '127.0.0.1')),
      '127.0.0.1'
    )
  })
})
