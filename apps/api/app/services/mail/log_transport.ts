import logger from '@adonisjs/core/services/logger'
import { MailResponse } from '@adonisjs/mail'
import { capturedOutbox } from '#services/e2e/captured_outbox'
import type { MailTransportContract, NodeMailerMessage } from '@adonisjs/mail/types'

/**
 * No-op mail transport for development and for production without a
 * provider key. Logs that a mail would have been sent (subject only at
 * info; recipients and body at debug, since links carry tokens and the
 * logs redact personal data). In test-support mode the message also goes
 * to the captured outbox (`GET /api/test/outbox`). Never throws.
 */
export class LogTransport implements MailTransportContract {
  async send(message: NodeMailerMessage) {
    logger.info({ subject: message.subject }, 'mail not sent (log transport)')
    logger.debug({ to: message.to, text: message.text }, 'mail body (log transport)')
    capturedOutbox.capture(message)

    const envelope = { from: false as const, to: [] as string[] }
    return new MailResponse('log-transport', envelope, { messageId: 'log-transport' })
  }
}
