import env from '#start/env'
import { defineConfig, transports } from '@adonisjs/mail'
import { LogTransport } from '#services/mail/log_transport'
import { parseMailFrom, selectMailer } from '#services/mail/mail_settings'

/**
 * MAIL_DRIVER=log|resend|smtp picks the transport; a missing provider key
 * (or host) silently falls back to the `log` no-op, so dev and tests never
 * send real mail and production never crashes over mail. Tests use
 * `mail.fake()`. Links inside mails are built from APP_URL.
 */
const resendKey = env.get('RESEND_API_KEY')?.release()
const smtpHost = env.get('SMTP_HOST')
const smtpUser = env.get('SMTP_USERNAME')

const mailConfig = defineConfig({
  default: selectMailer({ driver: env.get('MAIL_DRIVER'), resendKey, smtpHost }),

  from: parseMailFrom(env.get('MAIL_FROM'), env.get('APP_URL'), env.get('APP_NAME')),

  mailers: {
    log: () => new LogTransport(),

    // Vendor API endpoint (not one of our domains).
    resend: transports.resend({
      key: resendKey ?? '',
      baseUrl: 'https://api.resend.com',
    }),

    smtp: transports.smtp({
      host: smtpHost ?? 'localhost',
      port: env.get('SMTP_PORT') ?? 587,
      auth: smtpUser
        ? { type: 'login', user: smtpUser, pass: env.get('SMTP_PASSWORD')?.release() ?? '' }
        : undefined,
    }),
  },
})

export default mailConfig

declare module '@adonisjs/mail/types' {
  export interface MailersList extends InferMailers<typeof mailConfig> {}
}
