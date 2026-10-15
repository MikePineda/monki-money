import type User from '#models/user'
import { firstName, LocalizedMail } from '#mails/localized_mail'

/**
 * Confirms the address two ways: a 6-digit code to type in the app (the
 * installed PWA on iOS never sees the link) and a link to the SPA route
 * /verify-email?token=...
 */
export default class VerifyEmailMail extends LocalizedMail {
  constructor(
    public user: User,
    public url: string,
    public code: string
  ) {
    super()
  }

  prepare() {
    this.compose({
      to: this.user.email,
      locale: this.user.locale,
      key: 'verifyEmail',
      data: { name: firstName(this.user.fullName), url: this.url, code: this.code },
    })
  }
}
