import vine from '@vinejs/vine'
import type { FieldContext, SchemaTypes } from '@vinejs/vine/types'

/**
 * Shared VineJS building blocks. Dates stay 'YYYY-MM-DD' strings end to end
 * (no Date/DateTime conversion), money is integer cents.
 */

/** Years the app stores: anything else is a typo (and some do not fit Postgres). */
const MIN_YEAR = 1900
const MAX_YEAR = 2999

function isSupportedYear(value: string) {
  const year = Number(value.slice(0, 4))
  return year >= MIN_YEAR && year <= MAX_YEAR
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !isSupportedYear(value)) return false
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

const monthRule = vine.createRule((value: unknown, _: undefined, field: FieldContext) => {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(value) ||
    !isSupportedYear(value)
  ) {
    field.report('The {{ field }} field must be a month (YYYY-MM)', 'month', field)
  }
})

/** Calendar month as 'YYYY-MM', years 1900-2999. */
export const month = () => vine.string().trim().use(monthRule())

/** Calendar date as 'YYYY-MM-DD', years 1900-2999. */
export const isoDate = () => vine.string().trim().use(isoDateRule())

/** IANA time zone name (Australia/Brisbane). */
export const timezone = () => vine.string().trim().use(timezoneRule())

/** Lowercased email address. */
export const email = () => vine.string().trim().toLowerCase().email().maxLength(254)

/** New password (scrypt-hashed). */
export const newPassword = () => vine.string().minLength(10).maxLength(128)

/**
 * Cloudflare Turnstile widget token (sign-up, login, forgot password).
 * Optional in the schema: the controllers check it first, and only when
 * TURNSTILE_SECRET is set (app/services/auth/turnstile_verifier.ts).
 */
export const turnstileToken = () => vine.string().maxLength(2048).optional()

/** Positive integer id (route params and foreign keys), within Postgres `integer`. */
export const id = () => vine.number().withoutDecimals().positive().max(2_147_483_647)

/** Integer amount in cents (may be negative). */
export const cents = () => vine.number().withoutDecimals().min(-2_000_000_000).max(2_000_000_000)

/** Integer amount in cents typed by a person: positive, the sign comes from the kind. */
export const amount = () => vine.number().withoutDecimals().positive().max(2_000_000_000)

/** Integer amount in cents that cannot be negative (savings, contributions). */
export const nonNegativeCents = () => vine.number().withoutDecimals().min(0).max(2_000_000_000)

/** Integer amount in cents that may go either way (split lines). */
export const signedCents = () => cents()

/** Client-generated idempotency key. */
export const uuid = () => vine.string().trim().uuid()

/**
 * A list from the query string that also accepts a single value:
 * `?accountId=1` and `?accountId[]=1&accountId[]=2` both give an array.
 */
export const oneOrMany = <Schema extends SchemaTypes>(schema: Schema) =>
  vine
    .array(schema)
    .maxLength(50)
    .parse((value) =>
      value === undefined || value === null || Array.isArray(value) ? value : [value]
    )

/** `{ params: { id } }` for routes with `:id`. */
export const idParams = () => vine.object({ id: id() })
