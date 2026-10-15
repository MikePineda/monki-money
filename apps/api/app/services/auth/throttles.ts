import limiter from '@adonisjs/limiter/services/main'

/**
 * Brute-force protection for the public auth endpoints: 5 attempts per
 * minute per key, then the key is blocked for 20 minutes. Keys always
 * include the client IP from `clientIp(ctx)` (CF-Connecting-IP).
 */
export function authAttempts() {
  return limiter.use({ requests: 5, duration: '1 minute', blockDuration: '20 mins' })
}

export function throttleKey(scope: string, ...parts: Array<string | number>) {
  return [scope, ...parts].join(':').toLowerCase()
}
