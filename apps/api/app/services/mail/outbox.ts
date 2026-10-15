import type { BaseMail } from '@adonisjs/mail'
import mail from '@adonisjs/mail/services/main'
import logger from '@adonisjs/core/services/logger'

/**
 * Sends transactional mail without ever failing the request that triggered
 * it: a provider outage must not break sign-up or an invitation (the user
 * can ask for a resend). Failures are logged without recipients.
 */
export default class Outbox {
  async send(mailable: BaseMail) {
    try {
      await mail.send(mailable)
    } catch (error) {
      logger.error({ err: error, mail: mailable.constructor.name }, 'mail delivery failed')
    }
  }
}
