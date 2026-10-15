import { Injectable, computed, inject, signal } from '@angular/core'
import type { ApiError } from '../../../core/api/http-errors'
import { ConfigStore } from '../../../core/auth/config.store'

/** The body field the API reads the widget token from. */
export const TURNSTILE_FIELD = 'turnstileToken'

/** A 422 that turned the Turnstile token down (missing, expired or rejected by Cloudflare). */
export function isTurnstileRejection(error: ApiError): boolean {
  return error.kind === 'validation' && TURNSTILE_FIELD in error.fields
}

/**
 * The bot check's state for one auth form (login, sign-up, forgot
 * password), provided by the page. The check exists only while
 * `GET /config` carries a `turnstileSiteKey`; then the form waits for the
 * widget's token and sends it as `turnstileToken`. Without a site key nothing
 * is rendered or sent, so the API's setting alone switches it on.
 */
@Injectable()
export class TurnstileGate {
  private readonly config = inject(ConfigStore)
  private readonly settled = signal(false)
  private readonly _token = signal<string | null>(null)

  readonly siteKey = computed(() => this.config.config()?.turnstileSiteKey || null)
  readonly token = this._token.asReadonly()
  /** The API turned the last token down; shown under the widget until the next submit. */
  readonly rejected = signal(false)
  /** Submit waits for the public config and, when the check is on, for a token. */
  readonly waiting = computed(
    () => !this.settled() || (this.siteKey() !== null && this._token() === null)
  )

  constructor() {
    void this.config.load().then(() => this.settled.set(true))
  }

  setToken(token: string | null): void {
    this._token.set(token)
  }

  /** `{ turnstileToken }` for the request body, only while the check is on. */
  field(): { turnstileToken?: string } {
    const token = this._token()
    return this.siteKey() && token ? { turnstileToken: token } : {}
  }

  /**
   * After a 422 on `turnstileToken`. True when the widget shows the message;
   * false when there is no widget yet (the config could not be read), in
   * which case the form shows it and the config is fetched again.
   */
  reject(): boolean {
    if (this.siteKey()) {
      this.rejected.set(true)
      return true
    }
    void this.config.load()
    return false
  }
}
