import { test } from '@japa/runner'
import { clientIp } from '#services/http/client_ip'

function ctxWith(headers: Record<string, string>, ip = '10.0.0.5') {
  return {
    request: {
      header: (name: string) => headers[name.toLowerCase()],
      ip: () => ip,
    },
  }
}

test.group('clientIp', () => {
  test('test_cf_connecting_ip_wins_over_an_arbitrary_x_forwarded_for', ({ assert }) => {
    const ctx = ctxWith({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '6.6.6.6' })
    assert.equal(clientIp(ctx), '203.0.113.7')
  })

  test('test_falls_back_to_the_trusted_proxy_resolution_without_cloudflare', ({ assert }) => {
    assert.equal(clientIp(ctxWith({}, '198.51.100.20')), '198.51.100.20')
  })

  test('test_blank_cf_header_is_ignored', ({ assert }) => {
    assert.equal(clientIp(ctxWith({ 'cf-connecting-ip': '  ' }, '198.51.100.20')), '198.51.100.20')
  })
})
