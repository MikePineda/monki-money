import { readPreference, writePreference } from './local-preference'

/** localStorage key prefix, per person: the account last used for an expense or income. */
export const LAST_ACCOUNT_KEY = 'qa:account:'

/**
 * The account this person last saved an expense or income with on this
 * device (quick add and the receipt scanner both open with it), or null.
 */
export function readLastAccount(view: Window, userId: number): number | null {
  const raw = readPreference(view, `${LAST_ACCOUNT_KEY}${userId}`)
  return raw !== null && /^\d+$/.test(raw) ? Number(raw) : null
}

export function rememberLastAccount(view: Window, userId: number, accountId: number): void {
  writePreference(view, `${LAST_ACCOUNT_KEY}${userId}`, String(accountId))
}
