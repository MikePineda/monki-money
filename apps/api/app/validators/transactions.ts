import vine from '@vinejs/vine'
import { ENTRY_KINDS, TRANSACTION_KINDS, TRANSACTION_STATUSES } from '@monkimoney/shared'
import {
  amount,
  id,
  idParams,
  isoDate,
  month,
  oneOrMany,
  signedCents,
  uuid,
} from '#validators/rules'

/**
 * Amounts are typed positive (`amountCents > 0`); the service stores
 * expenses negative and income positive. Split lines are typed like the
 * parent (a negative line goes the other way).
 */

const splitLine = () =>
  vine.object({
    categoryId: id(),
    amountCents: signedCents(),
    memo: vine.string().trim().maxLength(255).nullable().optional(),
  })

const payee = () => vine.string().trim().maxLength(120).nullable()
const description = () => vine.string().trim().maxLength(500).nullable()
/**
 * NUL cannot be stored in Postgres text or jsonb (a 22P05 otherwise), and
 * `.` / `..` alone are path segments a browser resolves away in `/tags/:tag`.
 */
// eslint-disable-next-line no-control-regex -- NUL is exactly the character this rejects.
const STORABLE_TAG = /^(?!\.{1,2}$)[^\u0000]*$/

/**
 * One free label (a trip, an event): trimmed, 1 to 40 characters, no NUL,
 * not a lone `.` or `..`. The same rule reads a tag back from a filter or a
 * URL (`?tag=`, `/tags/:tag`).
 */
export const tag = () => vine.string().trim().minLength(1).maxLength(40).regex(STORABLE_TAG)

/** Up to 20 distinct labels on a transaction (or on both legs of a transfer). */
export const tags = () => vine.array(tag()).maxLength(20).distinct()

const entryFields = {
  clientId: uuid().optional(),
  categoryId: id().nullable().optional(),
  splits: vine.array(splitLine()).minLength(2).maxLength(50).optional(),
  payee: payee().optional(),
  description: description().optional(),
  paidByUserId: id().nullable().optional(),
  status: vine.enum(TRANSACTION_STATUSES).optional(),
  isPrivate: vine.boolean().optional(),
  tags: tags().optional(),
}

/**
 * Origins a person may claim: typed by hand, or a draft read from a receipt
 * photo (`POST /receipts/scan`). `import` and `telegram` rows are only ever
 * written by the server.
 */
export const CLIENT_TRANSACTION_SOURCES = ['manual', 'receipt'] as const

export const createTransactionValidator = vine.create({
  ...entryFields,
  accountId: id(),
  kind: vine.enum(ENTRY_KINDS),
  date: isoDate(),
  amountCents: amount(),
  source: vine.enum(CLIENT_TRANSACTION_SOURCES).optional(),
})

/** Quick add: only the amount is required. */
export const quickTransactionValidator = vine.create({
  ...entryFields,
  accountId: id().optional(),
  kind: vine.enum(ENTRY_KINDS).optional(),
  date: isoDate().optional(),
  amountCents: amount(),
})

export const updateTransactionValidator = vine.create({
  params: idParams(),
  accountId: id().optional(),
  kind: vine.enum(ENTRY_KINDS).optional(),
  date: isoDate().optional(),
  amountCents: amount().optional(),
  categoryId: id().nullable().optional(),
  payee: payee().optional(),
  description: description().optional(),
  paidByUserId: id().nullable().optional(),
  status: vine.enum(TRANSACTION_STATUSES).optional(),
  isPrivate: vine.boolean().optional(),
  tags: tags().optional(),
  needsReview: vine.boolean().optional(),
  applyToFuture: vine.boolean().optional(),
})

export const transactionParamsValidator = vine.create({
  params: idParams(),
})

/** `PUT /transactions/:id/splits`: no lines = not split anymore. */
export const updateSplitsValidator = vine.create({
  params: idParams(),
  splits: vine.array(splitLine()).maxLength(50),
  categoryId: id().nullable().optional(),
})

export const bulkCategorizeValidator = vine.create({
  ids: vine.array(id()).minLength(1).maxLength(500).distinct(),
  categoryId: id().nullable(),
})

/**
 * `GET /transactions`. Repeated params (`accountId[]=1&accountId[]=2`) or
 * a single value (`accountId=1`) both work.
 */
export const listTransactionsValidator = vine.create({
  month: month().optional(),
  from: isoDate().optional(),
  to: isoDate().optional(),
  accountId: oneOrMany(id()).optional(),
  categoryId: oneOrMany(id()).optional(),
  uncategorized: vine.boolean().optional(),
  paidByUserId: id().optional(),
  kind: vine.enum(TRANSACTION_KINDS).optional(),
  status: vine.enum(TRANSACTION_STATUSES).optional(),
  needsReview: vine.boolean().optional(),
  q: vine.string().trim().minLength(1).maxLength(100).optional(),
  tag: tag().optional(),
  page: vine.number().withoutDecimals().min(1).max(100_000).optional(),
  perPage: vine.number().withoutDecimals().min(1).max(100).optional(),
  sort: vine.enum(['date', '-date', 'amount', '-amount'] as const).optional(),
})
