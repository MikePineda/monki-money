/**
 * Pure helpers behind `config/mail.ts`. Mail must never fail the app nor
 * leave dev/tests: a missing provider key silently selects the `log` no-op.
 */

export type MailerName = 'log' | 'resend' | 'smtp'

export interface MailerSelectionInput {
  driver?: 'log' | 'resend' | 'smtp'
  resendKey?: string
  smtpHost?: string
}

export function selectMailer(input: MailerSelectionInput): MailerName {
  if (input.driver === 'resend' && input.resendKey?.trim()) return 'resend'
  if (input.driver === 'smtp' && input.smtpHost?.trim()) return 'smtp'
  return 'log'
}

/** A bare address, or an address with a display name (the mail package's Recipient). */
export type MailFrom = string | { address: string; name: string }

/**
 * Parses `MAIL_FROM` ("Name <address>" or a bare address). Empty means
 * `noreply@<host of APP_URL>`, so no domain is ever hardcoded.
 */
export function parseMailFrom(raw: string | undefined, appUrl: string, appName?: string): MailFrom {
  const value = raw?.trim()
  if (!value) {
    const address = `noreply@${new URL(appUrl).hostname}`
    return appName ? { name: appName, address } : address
  }

  const match = value.match(/^(.*)<([^>]+)>\s*$/)
  if (!match) return value

  const name = match[1].trim().replace(/^"(.*)"$/, '$1')
  const address = match[2].trim()
  return name ? { name, address } : address
}
