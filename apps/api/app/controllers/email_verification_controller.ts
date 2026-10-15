import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { verifyEmailValidator } from '#validators/auth'
import { isoTimestamp } from '#domain/time/iso_timestamp'
import EmailVerificationService from '#services/auth/email_verification_service'
import { throttleKey, verificationResends } from '#services/auth/throttles'

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
   * POST /auth/email/resend: a new link for the logged-in user (no-op once
   * verified). 3 per 15 minutes per user.
   */
  async resend({ auth, response }: HttpContext) {
    const user = auth.getUserOrFail()
    await verificationResends().consume(throttleKey('resend', user.id))

    await this.verification.send(user)
    return response.accepted({ data: { queued: true } })
  }
}
