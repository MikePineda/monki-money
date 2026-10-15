import User from '#models/user'
import { DateTime } from 'luxon'
import { inject } from '@adonisjs/core'
import Outbox from '#services/mail/outbox'
import { InvalidToken } from '#exceptions/errors'
import { appUrl } from '#services/http/app_url'
import VerifyEmailMail from '#mails/verify_email_mail'
import { issueEmailVerificationToken, readEmailVerificationToken } from '#services/auth/auth_tokens'

/**
 * Email ownership proof. The link carries an encrypted token (24 h) bound
 * to the user id and the address it was sent to, so changing the address
 * voids older links. Verification is public: on iOS the link opens Safari,
 * outside the installed PWA's session.
 */
@inject()
export default class EmailVerificationService {
  constructor(protected outbox: Outbox) {}

  async send(user: User) {
    if (user.isEmailVerified) return
    const url = appUrl('/verify-email', { token: issueEmailVerificationToken(user) })
    await this.outbox.send(new VerifyEmailMail(user, url))
  }

  async verify(token: string): Promise<User> {
    const payload = readEmailVerificationToken(token)
    if (!payload) throw new InvalidToken()

    const user = await User.find(payload.userId)
    if (!user || user.email !== payload.email) throw new InvalidToken()

    if (!user.isEmailVerified) {
      user.emailVerifiedAt = DateTime.now()
      await user.save()
    }
    return user
  }
}
