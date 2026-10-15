import { errors } from '@adonisjs/auth'
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { SESSION_VERSION_KEY } from '#services/auth/web_session'

/**
 * Runs right after `auth`. A session whose stamped version differs from
 * `users.session_version` was revoked ("log out everywhere", password
 * change or reset): it is destroyed and the request answers 401. A session
 * without a stamp never came from the login flow and is rejected too.
 */
export default class VerifySessionVersionMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const user = ctx.auth.getUserOrFail()

    if (ctx.session.get(SESSION_VERSION_KEY) !== user.sessionVersion) {
      await ctx.auth.use('web').logout()
      throw new errors.E_UNAUTHORIZED_ACCESS('Session revoked', { guardDriverName: 'session' })
    }

    return next()
  }
}
