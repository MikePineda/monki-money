import app from '@adonisjs/core/services/app'
import { TurnstileVerifier } from '#services/auth/turnstile_verifier'

/** The only token the fake verifier accepts. */
export const PASSING_TURNSTILE_TOKEN = 'turnstile-test-pass'

/**
 * Stands in for Cloudflare as if TURNSTILE_SECRET were set: accepts only
 * PASSING_TURNSTILE_TOKEN and records every call. Never touches the network.
 */
export class FakeTurnstileVerifier extends TurnstileVerifier {
  calls: Array<{ token: string | null; remoteIp: string | null }> = []

  async verify(token: string | null, remoteIp: string | null) {
    this.calls.push({ token, remoteIp })
    return token === PASSING_TURNSTILE_TOKEN
  }
}

/**
 * Swaps the container binding for the fake. Returns the fake and the
 * restore function (hand it to `cleanup`).
 */
export function fakeTurnstile() {
  const fake = new FakeTurnstileVerifier()
  app.container.swap(TurnstileVerifier, () => fake)
  return { fake, restore: () => app.container.restore(TurnstileVerifier) }
}
