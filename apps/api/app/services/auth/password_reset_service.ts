import { DateTime } from 'luxon'
import User from '#models/user'
import { inject } from '@adonisjs/core'
import Outbox from '#services/mail/outbox'
import hash from '@adonisjs/core/services/hash'
import { InvalidToken } from '#exceptions/errors'
import { appUrl } from '#services/http/app_url'
import PasswordResetMail from '#mails/password_reset_mail'
import { issuePasswordResetToken, readPasswordResetToken } from '#services/auth/auth_tokens'

/**
 * Forgot/reset password. The request never reveals whether the email
 * exists (same answer, and the mail is dispatched without waiting for the
 * provider, so timing does not tell either). The token embeds the user's
 * session_version; the reset is one conditional UPDATE on that version, so
 * the token works exactly once even under concurrent use, and every
 * existing session is revoked.
 */
@inject()
export default class PasswordResetService {
  constructor(protected outbox: Outbox) {}

  async request(email: string) {
    const user = await User.findBy('email', email)
    if (!user) return

    const token = issuePasswordResetToken(user)
    const url = appUrl(`/reset-password/${encodeURIComponent(token)}`)
    this.outbox.dispatch(new PasswordResetMail(user, url))
  }

  async reset(token: string, password: string): Promise<User> {
    const payload = readPasswordResetToken(token)
    if (!payload) throw new InvalidToken()

    const passwordHash = await hash.make(password)
    const affected = await User.query()
      .where('id', payload.userId)
      .where('session_version', payload.sv)
      .update({
        password: passwordHash,
        session_version: payload.sv + 1,
        updated_at: DateTime.now().toSQL(),
      })
    // knex reports the affected row count (as a number or a one-item array).
    const updatedRows = Number(Array.isArray(affected) ? affected[0] : affected)
    if (updatedRows !== 1) throw new InvalidToken()

    return User.findOrFail(payload.userId)
  }
}
