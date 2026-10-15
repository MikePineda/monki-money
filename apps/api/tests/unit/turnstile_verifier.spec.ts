import { test } from '@japa/runner'
import {
  CloudflareTurnstileVerifier,
  createTurnstileVerifier,
  NoopTurnstileVerifier,
} from '#services/auth/turnstile_verifier'

const settings = {
  siteverifyUrl: 'https://siteverify.example.test/verify',
  timeoutMs: 5_000,
}

type FetchCall = { url: string; init: RequestInit }

/** A `fetch` stand-in: records the calls and answers with `respond()`. */
function stubFetch(respond: (call: FetchCall) => Promise<Response>) {
  const calls: FetchCall[] = []
  const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} }
    calls.push(call)
    return respond(call)
  }
  return { calls, fetcher: fetcher as typeof fetch }
}

const json = (body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
  )

test.group('Turnstile verifier', () => {
  test('test_empty_secret_binds_the_noop_verifier', async ({ assert }) => {
    assert.instanceOf(
      createTurnstileVerifier({ ...settings, secret: undefined }),
      NoopTurnstileVerifier
    )
    assert.instanceOf(createTurnstileVerifier({ ...settings, secret: '  ' }), NoopTurnstileVerifier)
    assert.instanceOf(
      createTurnstileVerifier({ ...settings, secret: 'a-secret' }),
      CloudflareTurnstileVerifier
    )
    assert.isTrue(await new NoopTurnstileVerifier().verify(null, null))
  })

  test('test_cloudflare_verifier_posts_secret_token_and_remote_ip', async ({ assert }) => {
    const { calls, fetcher } = stubFetch(() => json({ 'success': true, 'error-codes': [] }))
    const verifier = new CloudflareTurnstileVerifier('a-secret', settings, fetcher)

    const passed = await verifier.verify('a-token', '203.0.113.7')

    assert.isTrue(passed)
    assert.lengthOf(calls, 1)
    assert.equal(calls[0].url, settings.siteverifyUrl)
    assert.equal(calls[0].init.method, 'POST')
    assert.instanceOf(calls[0].init.signal, AbortSignal)
    const body = new URLSearchParams(String(calls[0].init.body))
    assert.deepEqual(Object.fromEntries(body), {
      secret: 'a-secret',
      response: 'a-token',
      remoteip: '203.0.113.7',
    })
  })

  test('test_cloudflare_verifier_returns_cloudflares_verdict', async ({ assert }) => {
    const { fetcher } = stubFetch(() =>
      json({ 'success': false, 'error-codes': ['invalid-input-response'] })
    )
    const verifier = new CloudflareTurnstileVerifier('a-secret', settings, fetcher)

    assert.isFalse(await verifier.verify('a-forged-token', null))
  })

  test('test_cloudflare_verifier_rejects_a_missing_token_without_calling_cloudflare', async ({
    assert,
  }) => {
    const { calls, fetcher } = stubFetch(() => json({ success: true }))
    const verifier = new CloudflareTurnstileVerifier('a-secret', settings, fetcher)

    assert.isFalse(await verifier.verify(null, '203.0.113.7'))
    assert.isFalse(await verifier.verify('', '203.0.113.7'))
    assert.lengthOf(calls, 0)
  })

  test('test_cloudflare_verifier_fails_closed_on_network_errors_and_non_json', async ({
    assert,
  }) => {
    const offline = stubFetch(() => Promise.reject(new TypeError('fetch failed')))
    const html = stubFetch(() =>
      Promise.resolve(new Response('<html>Bad gateway</html>', { status: 502 }))
    )
    const notAnObject = stubFetch(() => json('success'))

    for (const { fetcher } of [offline, html, notAnObject]) {
      const verifier = new CloudflareTurnstileVerifier('a-secret', settings, fetcher)
      assert.isFalse(await verifier.verify('a-token', null))
    }
  })

  test('test_cloudflare_verifier_gives_up_after_the_timeout', async ({ assert }) => {
    // Never answers on its own; only the abort signal ends the request.
    const { fetcher } = stubFetch(
      ({ init }) =>
        new Promise<Response>((_, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason))
        })
    )
    const verifier = new CloudflareTurnstileVerifier(
      'a-secret',
      { ...settings, timeoutMs: 20 },
      fetcher
    )

    assert.isFalse(await verifier.verify('a-token', null))
  })
})
