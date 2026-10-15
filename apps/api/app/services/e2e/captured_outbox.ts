import type { NodeMailerMessage } from '@adonisjs/mail/types'
import { testSupportEnabled } from '#services/e2e/test_support'

export interface CapturedMail {
  to: string[]
  subject: string
  /** Every URL found in the text body (verify, reset and invite links). */
  links: string[]
  /** Every line of the text body that is a 6-digit code (email verification). */
  codes: string[]
  sentAt: string
}

const CAPACITY = 50
const entries: CapturedMail[] = []

function addresses(recipients: NodeMailerMessage['to']): string[] {
  return (recipients ?? []).map((recipient) =>
    typeof recipient === 'string' ? recipient : recipient.address
  )
}

/**
 * In-memory ring buffer (last 50) of the mails the `log` transport would
 * have sent, so Playwright can follow verification/invite links through
 * `GET /api/test/outbox`. Captures only in test-support mode; production
 * never keeps mail contents in memory.
 */
export const capturedOutbox = {
  capture(message: NodeMailerMessage) {
    if (!testSupportEnabled()) return
    const text = typeof message.text === 'string' ? message.text : ''
    entries.push({
      to: addresses(message.to),
      subject: typeof message.subject === 'string' ? message.subject : '',
      links: text.match(/https?:\/\/[^\s<>"]+/g) ?? [],
      codes: [...text.matchAll(/^\s*(\d{6})\s*$/gm)].map((match) => match[1]),
      sentAt: new Date().toISOString(),
    })
    if (entries.length > CAPACITY) entries.splice(0, entries.length - CAPACITY)
  },

  list(): CapturedMail[] {
    return [...entries]
  },

  clear() {
    entries.length = 0
  },
}
