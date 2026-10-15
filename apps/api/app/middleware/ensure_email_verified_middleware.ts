import type { HttpContext } from '@adonisjs/core/http'
import { EmailNotVerified } from '#exceptions/errors'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * Household resources need a verified email. Unverified users can still
 * read /auth/me, resend the verification mail, edit their profile and log out.
 */
export default class EnsureEmailVerifiedMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    if (!ctx.auth.getUserOrFail().isEmailVerified) throw new EmailNotVerified()
    return next()
  }
}
