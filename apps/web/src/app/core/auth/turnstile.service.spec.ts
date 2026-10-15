import { TestBed } from '@angular/core/testing'
import { clearTurnstile, fakeTurnstile } from '../../../testing/turnstile-testing'
import {
  TURNSTILE_SCRIPT_URL,
  TurnstileService,
  type TurnstileWidgetOptions,
} from './turnstile.service'

describe('TurnstileService', () => {
  let service: TurnstileService

  function scripts(): HTMLScriptElement[] {
    return [...document.head.querySelectorAll<HTMLScriptElement>('script')].filter(
      (script) => script.src === TURNSTILE_SCRIPT_URL
    )
  }

  function options(overrides: Partial<TurnstileWidgetOptions> = {}): TurnstileWidgetOptions {
    return {
      siteKey: 'site-key',
      theme: 'light',
      language: 'en',
      onToken: vi.fn(),
      ...overrides,
    }
  }

  beforeEach(() => {
    TestBed.configureTestingModule({})
    service = TestBed.inject(TurnstileService)
  })

  afterEach(() => {
    for (const script of scripts()) {
      script.remove()
    }
    clearTurnstile()
  })

  it('test_loads_the_cloudflare_script_once_in_explicit_mode', async () => {
    const first = service.load()
    const second = service.load()

    expect(scripts()).toHaveLength(1)
    // Explicit render, and never proxied by the PWA service worker.
    expect(TURNSTILE_SCRIPT_URL).toBe(
      'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&ngsw-bypass=true'
    )
    const api = fakeTurnstile()
    scripts()[0]?.dispatchEvent(new Event('load'))

    expect(await first).toBe(api)
    expect(await second).toBe(api)
  })

  it('test_reuses_a_script_that_is_already_on_the_page', async () => {
    const api = fakeTurnstile()

    expect(await service.load()).toBe(api)
    expect(scripts()).toHaveLength(0)
  })

  it('test_a_script_that_fails_to_load_rejects_and_can_be_retried', async () => {
    const failed = service.load()
    scripts()[0]?.dispatchEvent(new Event('error'))

    await expect(failed).rejects.toThrow()
    expect(scripts()).toHaveLength(0)

    const retry = service.load()
    expect(scripts()).toHaveLength(1)
    const api = fakeTurnstile()
    scripts()[0]?.dispatchEvent(new Event('load'))
    expect(await retry).toBe(api)
  })

  it('test_a_script_that_loads_without_the_api_counts_as_a_failure', async () => {
    const loading = service.load()
    scripts()[0]?.dispatchEvent(new Event('load'))

    await expect(loading).rejects.toThrow()
  })

  it('test_renders_an_explicit_widget_with_the_theme_and_language', async () => {
    const api = fakeTurnstile()
    const host = document.createElement('div')

    await service.render(host, options({ theme: 'dark', language: 'es' }))

    expect(api.render).toHaveBeenCalledWith(
      host,
      expect.objectContaining({
        sitekey: 'site-key',
        theme: 'dark',
        language: 'es',
        size: 'flexible',
      })
    )
  })

  it('test_reports_the_token_and_forgets_it_when_it_expires_or_fails', async () => {
    const api = fakeTurnstile()
    const onToken = vi.fn()

    await service.render(document.createElement('div'), options({ onToken }))
    api.solve('token-1')
    api.expire()
    api.fail()

    expect(onToken.mock.calls).toEqual([['token-1'], [null], [null]])
  })

  it('test_the_handle_resets_and_removes_its_own_widget', async () => {
    const api = fakeTurnstile()

    const handle = await service.render(document.createElement('div'), options())
    handle.reset()
    handle.remove()

    expect(api.reset).toHaveBeenCalledWith('widget-1')
    expect(api.remove).toHaveBeenCalledWith('widget-1')
  })
})
