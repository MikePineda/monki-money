import limiter from '@adonisjs/limiter/services/main'

/**
 * Brute-force and abuse protection. Keys always include the client IP from
 * `clientIp(ctx)` (CF-Connecting-IP) or a user/household id.
 */

/**
 * Public auth endpoints (login, sign-up, forgot/reset password,
 * invitations) and password re-checks of logged-in users: 5 attempts per
 * minute per key, then the key is blocked for 20 minutes.
 */
export function authAttempts() {
  return limiter.use({ requests: 5, duration: '1 minute', blockDuration: '20 mins' })
}

/** Verification mail resends: 3 per 15 minutes per user. */
export function verificationResends() {
  return limiter.use({ requests: 3, duration: '15 mins' })
}

/** Invitation mails (create + resend): 10 per hour per household. */
export function invitationSends() {
  return limiter.use({ requests: 10, duration: '1 hour' })
}

export function throttleKey(scope: string, ...parts: Array<string | number>) {
  return [scope, ...parts].join(':').toLowerCase()
}
