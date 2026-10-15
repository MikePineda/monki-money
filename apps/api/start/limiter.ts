/*
|--------------------------------------------------------------------------
| HTTP throttles
|--------------------------------------------------------------------------
|
| Route-level throttles. The auth endpoints use the stricter
| `authAttempts()` limiter directly in their controllers (failures only,
| per IP + email). Keys use `clientIp(ctx)` (CF-Connecting-IP), never a
| client-supplied X-Forwarded-For.
|
*/

import limiter from '@adonisjs/limiter/services/main'
import type { HttpContext } from '@adonisjs/core/http'
import { clientIp } from '#services/http/client_ip'

/** The logged-in user, or the client IP for guests. */
function userOrIp(ctx: HttpContext) {
  return ctx.auth.user ? `user_${ctx.auth.user.id}` : `ip_${clientIp(ctx)}`
}

/** 300 requests per minute per logged-in user (per IP for guests). */
export const apiThrottle = limiter.define('api', (ctx) => {
  return limiter.allowRequests(300).every('1 minute').usingKey(userOrIp(ctx))
})

/** Presigned direct uploads: 30 per minute per user. */
export const uploadsThrottle = limiter.define('uploads', (ctx) => {
  return limiter.allowRequests(30).every('1 minute').usingKey(userOrIp(ctx))
})

/** Receipt scans (one vision model call each): 10 per minute per user. */
export const receiptScansThrottle = limiter.define('receipt_scans', (ctx) => {
  return limiter.allowRequests(10).every('1 minute').usingKey(userOrIp(ctx))
})
