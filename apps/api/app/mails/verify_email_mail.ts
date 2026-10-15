import type User from '#models/user'
import { firstName, LocalizedMail } from '#mails/localized_mail'

/** Link to confirm the address (SPA route /verify-email?token=...). */
export default class VerifyEmailMail extends LocalizedMail {
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
      key: 'verifyEmail',
      data: { name: firstName(this.user.fullName), url: this.url },
    })
  }
}
