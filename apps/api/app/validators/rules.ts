import vine from '@vinejs/vine'
import type { FieldContext } from '@vinejs/vine/types'

/**
 * Shared VineJS building blocks. Dates stay 'YYYY-MM-DD' strings end to end
 * (no Date/DateTime conversion), money is integer cents.
 */

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

const isoDateRule = vine.createRule((value: unknown, _: undefined, field: FieldContext) => {
  if (typeof value !== 'string' || !isIsoDate(value)) {
    field.report('The {{ field }} field must be a valid date (YYYY-MM-DD)', 'dateString', field)
  }
})

const timezoneRule = vine.createRule((value: unknown, _: undefined, field: FieldContext) => {
  if (typeof value !== 'string' || !Intl.supportedValuesOf('timeZone').includes(value)) {
    field.report('The {{ field }} field is not a valid time zone', 'timezone', field)
  }
})

/** Calendar date as 'YYYY-MM-DD'. */
export const isoDate = () => vine.string().trim().use(isoDateRule())

/** IANA time zone name (Australia/Brisbane). */
export const timezone = () => vine.string().trim().use(timezoneRule())

/** Lowercased email address. */
export const email = () => vine.string().trim().toLowerCase().email().maxLength(254)

/** New password (scrypt-hashed). */
export const newPassword = () => vine.string().minLength(10).maxLength(128)

/** Positive integer id (route params and foreign keys). */
export const id = () => vine.number().withoutDecimals().positive()

/** Integer amount in cents (may be negative). */
export const cents = () => vine.number().withoutDecimals().min(-2_000_000_000).max(2_000_000_000)

/** `{ params: { id } }` for routes with `:id`. */
export const idParams = () => vine.object({ id: id() })
