import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { clientIp } from '#services/http/client_ip'
import { authAttempts, throttleKey } from '#services/auth/throttles'
import PasswordResetService from '#services/auth/password_reset_service'
import { forgotPasswordValidator, resetPasswordValidator } from '#validators/auth'

@inject()
export default class PasswordResetController {
  constructor(protected passwords: PasswordResetService) {}

  /**
   * POST /auth/password/forgot: always 200, whether or not the email exists.
   * Every call counts toward the per IP + email limit.
   */
  async store(ctx: HttpContext) {
    const { email } = await ctx.request.validateUsing(forgotPasswordValidator)

    await authAttempts().consume(throttleKey('forgot', clientIp(ctx), email))
    await this.passwords.request(email)

    return ctx.serialize({ requested: true })
  }

  /** POST /auth/password/reset: single-use token; failures count per IP. */
  async update(ctx: HttpContext) {
    const { token, password } = await ctx.request.validateUsing(resetPasswordValidator)

    const [throttled] = await authAttempts().penalize(throttleKey('reset', clientIp(ctx)), () =>
      this.passwords.reset(token, password)
    )
    if (throttled) throw throttled

    return ctx.serialize({ reset: true })
  }
}
