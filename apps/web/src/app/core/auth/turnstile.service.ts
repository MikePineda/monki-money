import { DOCUMENT, Injectable, inject } from '@angular/core'
import type { AppLang } from '../../domain/locale'
import { WINDOW } from '../platform/window.token'
import type { ResolvedTheme } from '../theme/theme.store'

/**
 * Cloudflare's widget script, in explicit mode (the app decides where and
 * when to render). It is the only external script the app loads, and only
 * once a screen needs a widget because the API sent a site key: never from
 * index.html.
 */
export const TURNSTILE_SCRIPT_URL =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

/** The render options this app passes (a subset of Cloudflare's). */
export interface TurnstileRenderOptions {
  'sitekey': string
  'theme': ResolvedTheme
  'language': AppLang
  'size': 'flexible'
  'callback': (token: string) => void
  'expired-callback': () => void
  'error-callback': (code: string) => boolean | void
}

/** The slice of `window.turnstile` this app uses. */
export interface TurnstileApi {
  render(host: HTMLElement, options: TurnstileRenderOptions): string | null | undefined
  reset(widgetId: string): void
  remove(widgetId: string): void
}

export interface TurnstileWidgetOptions {
  siteKey: string
  theme: ResolvedTheme
  language: AppLang
  /** A fresh token, or null once it expired or the check failed. */
  onToken: (token: string | null) => void
}

/** One rendered widget. */
export interface TurnstileHandle {
  /** Asks for a new token (tokens are single use: after every failed submit). */
  reset(): void
  remove(): void
}

type TurnstileWindow = Window & { turnstile?: TurnstileApi }

/**
 * Cloudflare Turnstile, the bot check in front of login, sign-up and
 * forgot password (see docs/CONTRACTS.md, "Bot protection"). Loads the
 * script on first use (a failed load is not cached, so a later screen can
 * try again) and renders explicit widgets into host elements.
 */
@Injectable({ providedIn: 'root' })
export class TurnstileService {
  private readonly document = inject(DOCUMENT)
  private readonly window = inject(WINDOW) as TurnstileWindow
  private loading: Promise<TurnstileApi> | null = null

  load(): Promise<TurnstileApi> {
    const ready = this.window.turnstile
    if (ready) {
      return Promise.resolve(ready)
    }
    this.loading ??= new Promise<TurnstileApi>((resolve, reject) => {
      const script = this.document.createElement('script')
      const fail = (): void => {
        script.remove()
        this.loading = null
        reject(new Error('Cloudflare Turnstile could not be loaded'))
      }
      script.src = TURNSTILE_SCRIPT_URL
      script.async = true
      script.addEventListener('load', () => {
        const api = this.window.turnstile
        if (api) {
          resolve(api)
        } else {
          fail()
        }
      })
      script.addEventListener('error', fail)
      this.document.head.appendChild(script)
    })
    return this.loading
  }

  async render(host: HTMLElement, options: TurnstileWidgetOptions): Promise<TurnstileHandle> {
    const api = await this.load()
    const id = api.render(host, {
      'sitekey': options.siteKey,
      'theme': options.theme,
      'language': options.language,
      'size': 'flexible',
      'callback': (token) => options.onToken(token),
      'expired-callback': () => options.onToken(null),
      // Not handled here: Turnstile retries on its own and shows its state.
      'error-callback': () => {
        options.onToken(null)
        return false
      },
    })
    return {
      reset: () => {
        if (id) {
          api.reset(id)
        }
      },
      remove: () => {
        if (id) {
          api.remove(id)
        }
      },
    }
  }
}
