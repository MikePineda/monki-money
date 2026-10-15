import env from '#start/env'
import type { TurnstileSettings } from '#services/auth/turnstile_verifier'

/**
 * Cloudflare Turnstile: bot check on sign-up, login and forgot password.
 *
 * - TURNSTILE_SECRET empty: the check is off (no-op verifier).
 * - TURNSTILE_SITE_KEY reaches the SPA through `GET /api/v1/config`.
 */
const turnstileConfig: TurnstileSettings = {
  secret: env.get('TURNSTILE_SECRET'),
  // Cloudflare's server-side validation endpoint (a vendor URL, not ours).
  siteverifyUrl: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
  timeoutMs: 5_000,
}

export default turnstileConfig
