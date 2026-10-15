import { LocalizedMail } from '#mails/localized_mail'

/**
 * Invitation link (SPA route /invite/:token). The invitee may not have an
 * account yet, so the mail uses the household's locale.
 */
export default class InvitationMail extends LocalizedMail {
  constructor(
    public email: string,
    public locale: string,
    public householdName: string,
    public inviterName: string,
    public url: string
  ) {
    super()
  }

  prepare() {
    this.compose({
      to: this.email,
      locale: this.locale,
      key: 'invitation',
      data: { householdName: this.householdName, inviterName: this.inviterName, url: this.url },
    })
  }
}
