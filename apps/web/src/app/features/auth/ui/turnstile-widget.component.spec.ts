import { Component, signal, viewChild } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { i18nTesting, i18nTestingProviders } from '../../../../testing/i18n-testing'
import { clearTurnstile, fakeTurnstile } from '../../../../testing/turnstile-testing'
import { TURNSTILE_SCRIPT_URL } from '../../../core/auth/turnstile.service'
import { LangStore } from '../../../core/i18n/lang.store'
import { ThemeStore } from '../../../core/theme/theme.store'
import type { AppLang } from '../../../domain/locale'
import { provideAuthScope } from '../auth.scope'
import { TurnstileWidgetComponent } from './turnstile-widget.component'

@Component({
  imports: [TurnstileWidgetComponent],
  providers: [provideAuthScope()],
  template: `
    @if (shown()) {
      <app-turnstile-widget siteKey="site-key" [(token)]="token" [rejected]="rejected()" />
    }
  `,
})
class Host {
  readonly shown = signal(true)
  readonly token = signal<string | null>(null)
  readonly rejected = signal(false)
  readonly widget = viewChild(TurnstileWidgetComponent)
}

describe('TurnstileWidgetComponent', () => {
  let theme: ReturnType<typeof signal<'light' | 'dark'>>
  let lang: ReturnType<typeof signal<AppLang>>

  async function mount() {
    theme = signal('light')
    lang = signal('en')
    TestBed.configureTestingModule({
      imports: [i18nTesting()],
      providers: [
        i18nTestingProviders(),
        { provide: ThemeStore, useValue: { resolved: theme } },
        { provide: LangStore, useValue: { lang } },
      ],
    })
    const fixture = TestBed.createComponent(Host)
    await fixture.whenStable()
    const root = fixture.nativeElement as HTMLElement
    return { fixture, host: fixture.componentInstance, root }
  }

  afterEach(() => {
    clearTurnstile()
    for (const script of document.head.querySelectorAll(`script[src="${TURNSTILE_SCRIPT_URL}"]`)) {
      script.remove()
    }
  })

  it('test_renders_the_widget_in_the_current_theme_and_language_and_exposes_the_token', async () => {
    const api = fakeTurnstile()
    const { fixture, host, root } = await mount()

    await vi.waitFor(() => expect(api.render).toHaveBeenCalledTimes(1))
    const [element, options] = api.render.mock.calls[0]!
    expect(root.contains(element)).toBe(true)
    expect(options).toEqual(expect.objectContaining({ theme: 'light', language: 'en' }))

    api.solve('token-1')
    await fixture.whenStable()

    expect(host.token()).toBe('token-1')
  })

  it('test_an_expired_token_is_dropped', async () => {
    const api = fakeTurnstile()
    const { fixture, host } = await mount()
    await vi.waitFor(() => expect(api.render).toHaveBeenCalled())

    api.solve('token-1')
    api.expire()
    await fixture.whenStable()

    expect(host.token()).toBeNull()
  })

  it('test_reset_drops_the_token_and_asks_for_a_new_one', async () => {
    const api = fakeTurnstile()
    const { fixture, host } = await mount()
    await vi.waitFor(() => expect(api.render).toHaveBeenCalled())
    api.solve('token-1')

    host.widget()?.reset()
    await fixture.whenStable()

    expect(host.token()).toBeNull()
    expect(api.reset).toHaveBeenCalledWith('widget-1')
  })

  it('test_follows_theme_and_language_changes_with_a_fresh_widget', async () => {
    const api = fakeTurnstile()
    const { fixture } = await mount()
    await vi.waitFor(() => expect(api.render).toHaveBeenCalledTimes(1))

    theme.set('dark')
    lang.set('es')
    await fixture.whenStable()

    await vi.waitFor(() => expect(api.render).toHaveBeenCalledTimes(2))
    expect(api.remove).toHaveBeenCalledWith('widget-1')
    expect(api.render.mock.calls[1]![1]).toEqual(
      expect.objectContaining({ theme: 'dark', language: 'es' })
    )
  })

  it('test_leaving_the_screen_removes_the_widget', async () => {
    const api = fakeTurnstile()
    const { fixture, host } = await mount()
    await vi.waitFor(() => expect(api.render).toHaveBeenCalled())

    host.shown.set(false)
    await fixture.whenStable()

    expect(api.remove).toHaveBeenCalledWith('widget-1')
  })

  it('test_a_script_that_cannot_load_says_so_and_never_yields_a_token', async () => {
    const { fixture, host, root } = await mount()
    const script = document.head.querySelector(`script[src="${TURNSTILE_SCRIPT_URL}"]`)
    expect(script).not.toBeNull()

    script?.dispatchEvent(new Event('error'))
    await vi.waitFor(() =>
      expect(root.querySelector('[data-testid="turnstile.unavailable"]')?.textContent).toContain(
        'The security check could not load'
      )
    )
    await fixture.whenStable()
    expect(host.token()).toBeNull()
  })

  it('test_a_rejected_check_is_explained_under_the_widget', async () => {
    fakeTurnstile()
    const { fixture, host, root } = await mount()

    host.rejected.set(true)
    await fixture.whenStable()

    expect(root.querySelector('[data-testid="turnstile.rejected"]')?.textContent).toContain(
      'Complete the security check and try again.'
    )
  })
})
