import type { BaseMail } from '@adonisjs/mail'
import mail from '@adonisjs/mail/services/main'
import logger from '@adonisjs/core/services/logger'

const inFlight = new Set<Promise<void>>()

/**
 * Sends transactional mail without ever failing the request that triggered
 * it: a provider outage must not break sign-up or an invitation (the user
 * can ask for a resend). Failures are logged without recipients.
 */
export default class Outbox {
  /** Sends and waits; delivery errors are logged, never thrown. */
  async send(mailable: BaseMail) {
    try {
      await mail.send(mailable)
    } catch (error) {
      logger.error({ err: error, mail: mailable.constructor.name }, 'mail delivery failed')
    }
  }

  /**
   * Fire-and-forget: the caller returns before the provider answers (used
   * where response time must not reveal whether a mail was sent at all).
   */
  dispatch(mailable: BaseMail): void {
    const delivery = this.send(mailable).finally(() => inFlight.delete(delivery))
    inFlight.add(delivery)
  }

  /** Resolves once every dispatched mail settled (tests, graceful shutdown). */
  static async settled() {
    await Promise.all([...inFlight])
  }
}
