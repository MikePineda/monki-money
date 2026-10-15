import { BaseMail } from '@adonisjs/mail'
import i18nManager from '@adonisjs/i18n/services/main'

/**
 * Text-first transactional mail translated with the recipient's locale
 * (`resources/lang/<locale>/messages.json`, keys `mail.<name>.subject|body`).
 */
export abstract class LocalizedMail extends BaseMail {
  protected compose(options: {
    to: string
    locale: string
    key: string
    data: Record<string, string>
  }) {
    const i18n = i18nManager.locale(options.locale)
    const subject = i18n.t(`messages.mail.${options.key}.subject`, options.data)
    const body = i18n.t(`messages.mail.${options.key}.body`, options.data)

    this.message
      .to(options.to)
      .subject(subject)
      .text(`${body}\n\n${i18n.t('messages.mail.signature')}\n`)
  }
}

/** First word of a full name, for greetings. */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName
}
