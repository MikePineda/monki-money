import type { Secret } from '@adonisjs/core/helpers'
import { FieldError } from '#exceptions/field_error'
import logger from '@adonisjs/core/services/logger'

/** Cloudflare's documented upper bound for a widget token. */
const MAX_TOKEN_LENGTH = 2048

export interface TurnstileSettings {
  /** Empty or missing: the check is skipped (NoopTurnstileVerifier). */
  secret?: Secret<string> | string
  /** Cloudflare's siteverify endpoint (config/turnstile.ts). */
  siteverifyUrl: string
  /** The verification gives up (and fails) after this long. */
  timeoutMs: number
}

type Fetch = typeof globalThis.fetch

/**
 * Bot check of the public auth endpoints (sign-up, login, forgot password).
 * A container singleton chosen by TURNSTILE_SECRET
 * (providers/turnstile_provider.ts); tests swap it with
 * `app.container.swap(TurnstileVerifier, ...)` and never call the network.
 */
export abstract class TurnstileVerifier {
  /** True when the widget token proves a human solved the challenge. */
  abstract verify(token: string | null, remoteIp: string | null): Promise<boolean>

  /**
   * Guard used by the controllers: 422 on `turnstileToken` when the check
   * fails. It runs before validation, credentials and throttles, so a bot
   * without a valid token never burns a real user's attempts.
   */
  async assertHuman(token: unknown, remoteIp: string | null): Promise<void> {
    if (!(await this.verify(normalizeToken(token), remoteIp))) {
      throw new FieldError('turnstileToken', 'turnstile')
    }
  }
}

/** TURNSTILE_SECRET is empty: every request passes. */
export class NoopTurnstileVerifier extends TurnstileVerifier {
  async verify(_token: string | null, _remoteIp: string | null) {
    return true
  }
}

/**
 * Server-side validation against Cloudflare's siteverify endpoint. Fails
 * closed: a missing token, a network error, a timeout or an unreadable
 * answer all count as "not verified".
 */
export class CloudflareTurnstileVerifier extends TurnstileVerifier {
  constructor(
    protected secret: string,
    protected settings: Pick<TurnstileSettings, 'siteverifyUrl' | 'timeoutMs'>,
    protected fetcher: Fetch = (input, init) => fetch(input, init)
  ) {
    super()
  }

  async verify(token: string | null, remoteIp: string | null) {
    if (!token) return false

    const body = new URLSearchParams({ secret: this.secret, response: token })
    if (remoteIp) body.set('remoteip', remoteIp)

    try {
      const response = await this.fetcher(this.settings.siteverifyUrl, {
        method: 'POST',
        body,
        signal: AbortSignal.timeout(this.settings.timeoutMs),
      })
      return isSuccess(await response.json())
    } catch (error) {
      logger.warn({ err: error }, 'turnstile siteverify failed; treating the request as a bot')
      return false
    }
  }
}

/** The verifier for these settings: no-op without a secret. */
export function createTurnstileVerifier(
  settings: TurnstileSettings,
  fetcher?: Fetch
): TurnstileVerifier {
  const raw = typeof settings.secret === 'string' ? settings.secret : settings.secret?.release()
  const secret = raw?.trim()
  if (!secret) return new NoopTurnstileVerifier()
  return new CloudflareTurnstileVerifier(secret, settings, fetcher)
}

function normalizeToken(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const token = value.trim()
  return token.length > 0 && token.length <= MAX_TOKEN_LENGTH ? token : null
}

/** Cloudflare's answer is `{ success: boolean, 'error-codes': string[], ... }`. */
function isSuccess(outcome: unknown): boolean {
  return (
    typeof outcome === 'object' &&
    outcome !== null &&
    (outcome as { success?: unknown }).success === true
  )
}
