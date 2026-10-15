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
import { clientIp } from '#services/http/client_ip'

/** 300 requests per minute per logged-in user (per IP for guests). */
export const apiThrottle = limiter.define('api', (ctx) => {
  const key = ctx.auth.user ? `user_${ctx.auth.user.id}` : `ip_${clientIp(ctx)}`
  return limiter.allowRequests(300).every('1 minute').usingKey(key)
})
