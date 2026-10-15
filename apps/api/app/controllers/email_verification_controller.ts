import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { clientIp } from '#services/http/client_ip'
import { isoTimestamp } from '#domain/time/iso_timestamp'
import EmailVerificationService from '#services/auth/email_verification_service'
import { verifyEmailCodeValidator, verifyEmailValidator } from '#validators/auth'
import { authAttempts, throttleKey, verificationResends } from '#services/auth/throttles'

@inject()
export default class EmailVerificationController {
  constructor(protected verification: EmailVerificationService) {}

  /** POST /auth/email/verify: public, the encrypted token is the proof. */
  async store(ctx: HttpContext) {
    const { token } = await ctx.request.validateUsing(verifyEmailValidator)

    const user = await this.verification.verify(token)

    return ctx.serialize({ emailVerifiedAt: isoTimestamp(user.emailVerifiedAt)! })
  }

  /**
   * POST /auth/email/verify-code: the 6-digit code from the mail, typed by
   * the logged-in user in the PWA. Wrong codes count toward 5 per minute
   * per IP + email (then 20 minutes blocked) on top of the code's own limit
   * of 5 attempts.
   */
  async verifyCode(ctx: HttpContext) {
    const { code } = await ctx.request.validateUsing(verifyEmailCodeValidator)
    const user = ctx.auth.getUserOrFail()

    const [throttled] = await authAttempts().penalize(
      throttleKey('verify-code', clientIp(ctx), user.email),
      () => this.verification.verifyCode(user, code)
    )
    if (throttled) throw throttled

    return ctx.serialize({ verified: true as const })
  }

  /**
   * POST /auth/email/resend: a new link and a new code for the logged-in
   * user (the previous code stops working; no-op once verified). 3 per 15
   * minutes per user.
   */
  async resend({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    await verificationResends().consume(throttleKey('resend', user.id))

    await this.verification.send(user)
    return response.accepted({ data: { queued: true } })
  }
}
