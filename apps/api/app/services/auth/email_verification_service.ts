import User from '#models/user'
import Clock from '#services/clock'
import { inject } from '@adonisjs/core'
import Outbox from '#services/mail/outbox'
import db from '@adonisjs/lucid/services/db'
import { InvalidToken } from '#exceptions/errors'
import { appUrl } from '#services/http/app_url'
import { FieldError } from '#exceptions/field_error'
import VerifyEmailMail from '#mails/verify_email_mail'
import { issueEmailVerificationToken, readEmailVerificationToken } from '#services/auth/auth_tokens'
import {
  generateVerificationCode,
  hashVerificationCode,
  VERIFICATION_CODE_MAX_ATTEMPTS,
  VERIFICATION_CODE_TTL_MINUTES,
  verificationCodeMatches,
} from '#domain/auth/verification_code'

/** Why a typed code was refused (the `verificationCode.<reason>` rule). */
type CodeRejection = 'invalid' | 'expired' | 'locked'

/**
 * Email ownership proof, two ways in one mail:
 *
 * - a link with an encrypted token (24 h) bound to the user id and the
 *   address it was sent to, so changing the address voids older links.
 *   Verification by link is public: on iOS the link opens Safari, outside
 *   the installed PWA's session;
 * - a 6-digit code (15 minutes, 5 wrong attempts) typed in the PWA by the
 *   logged-in user. Only its hash is stored; every send rotates it.
 */
@inject()
export default class EmailVerificationService {
  constructor(
    protected outbox: Outbox,
    protected clock: Clock
  ) {}

  async send(user: User) {
    if (user.isEmailVerified) return

    const code = generateVerificationCode()
    user.emailVerificationCodeHash = hashVerificationCode(user.id, code)
    user.emailVerificationCodeExpiresAt = this.clock
      .now()
      .plus({ minutes: VERIFICATION_CODE_TTL_MINUTES })
    user.emailVerificationCodeAttempts = 0
    await user.save()

    const url = appUrl('/verify-email', { token: issueEmailVerificationToken(user) })
    await this.outbox.send(new VerifyEmailMail(user, url, code))
  }

  async verify(token: string): Promise<User> {
    const payload = readEmailVerificationToken(token)
    if (!payload) throw new InvalidToken()

    const user = await User.find(payload.userId)
    if (!user || user.email !== payload.email) throw new InvalidToken()

    if (!user.isEmailVerified) {
      this.markVerified(user)
      await user.save()
    }
    return user
  }

  /**
   * The code from the mail, typed by the logged-in user. Idempotent once
   * verified. The row is locked while the attempt is judged, so parallel
   * guesses cannot exceed the attempt limit; the attempt counter is
   * committed before the 422 is thrown.
   */
  async verifyCode(user: User, code: string): Promise<User> {
    if (user.isEmailVerified) return user

    const outcome = await db.transaction(async (trx) => {
      const locked = await User.query({ client: trx })
        .where('id', user.id)
        .forUpdate()
        .firstOrFail()
      if (locked.isEmailVerified) return locked

      const rejection = this.judge(locked, code)
      if (rejection === null) {
        this.markVerified(locked)
      } else if (rejection === 'invalid') {
        locked.emailVerificationCodeAttempts += 1
        if (locked.emailVerificationCodeAttempts >= VERIFICATION_CODE_MAX_ATTEMPTS) {
          this.clearCode(locked, VERIFICATION_CODE_MAX_ATTEMPTS)
          await locked.save()
          return 'locked' as const
        }
      }
      await locked.save()
      return rejection ?? locked
    })

    if (typeof outcome === 'string') throw new FieldError('code', `verificationCode.${outcome}`)
    return outcome
  }

  /** null when `code` is the pending, unexpired code of `user`. */
  protected judge(user: User, code: string): CodeRejection | null {
    if (user.emailVerificationCodeAttempts >= VERIFICATION_CODE_MAX_ATTEMPTS) return 'locked'
    // No pending code (never sent, or already used): ask for a new mail.
    const hash = user.emailVerificationCodeHash
    const expiresAt = user.emailVerificationCodeExpiresAt
    if (!hash || !expiresAt) return 'expired'
    if (expiresAt.toMillis() <= this.clock.now().toMillis()) return 'expired'
    return verificationCodeMatches(user.id, code, hash) ? null : 'invalid'
  }

  protected markVerified(user: User) {
    user.emailVerifiedAt = this.clock.now()
    this.clearCode(user, 0)
  }

  protected clearCode(user: User, attempts: number) {
    user.emailVerificationCodeHash = null
    user.emailVerificationCodeExpiresAt = null
    user.emailVerificationCodeAttempts = attempts
  }
}
