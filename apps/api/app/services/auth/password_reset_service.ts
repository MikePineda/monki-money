import User from '#models/user'
import { inject } from '@adonisjs/core'
import Outbox from '#services/mail/outbox'
import { InvalidToken } from '#exceptions/errors'
import { appUrl } from '#services/http/app_url'
import PasswordResetMail from '#mails/password_reset_mail'
import { issuePasswordResetToken, readPasswordResetToken } from '#services/auth/auth_tokens'

/**
 * Forgot/reset password. The request never reveals whether the email
 * exists. The token embeds the user's session_version, which the reset
 * bumps: the token works once and every existing session is revoked.
 */
@inject()
export default class PasswordResetService {
  constructor(protected outbox: Outbox) {}

  async request(email: string) {
    const user = await User.findBy('email', email)
    if (!user) return

    const token = issuePasswordResetToken(user)
    const url = appUrl(`/reset-password/${encodeURIComponent(token)}`)
    await this.outbox.send(new PasswordResetMail(user, url))
  }

  async reset(token: string, password: string): Promise<User> {
    const payload = readPasswordResetToken(token)
    if (!payload) throw new InvalidToken()

    const user = await User.find(payload.userId)
    if (!user || user.sessionVersion !== payload.sv) throw new InvalidToken()

    user.password = password
    user.sessionVersion += 1
    await user.save()
    return user
  }
}
