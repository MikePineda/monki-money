import type User from '#models/user'
import { firstName, LocalizedMail } from '#mails/localized_mail'

/** Single-use reset link (SPA route /reset-password/:token). */
export default class PasswordResetMail extends LocalizedMail {
  constructor(
    public user: User,
    public url: string
  ) {
    super()
  }

  prepare() {
    this.compose({
      to: this.user.email,
      locale: this.user.locale,
      key: 'passwordReset',
      data: { name: firstName(this.user.fullName), url: this.url },
    })
  }
}
