import vine from '@vinejs/vine'
import { id, idParams, signedCents } from '#validators/rules'
import { IMPORT_BATCH_STATUSES, IMPORT_DECISIONS, IMPORT_RESOLUTIONS } from '@monkimoney/shared'

/**
 * Bank import review. The CSV itself is read by the controller (multipart,
 * in memory, size-capped); only its form fields go through VineJS.
 */

/** Multipart fields of `POST /imports`. */
export const uploadImportValidator = vine.create({
  accountId: id().optional(),
})

export const listImportsValidator = vine.create({
  status: vine.enum(IMPORT_BATCH_STATUSES).optional(),
  page: vine.number().withoutDecimals().min(1).max(100_000).optional(),
  perPage: vine.number().withoutDecimals().min(1).max(100).optional(),
})

export const importParamsValidator = vine.create({
  params: idParams(),
})

/** `GET /imports/:id`: `?rows=0` answers the batch alone (polling, the result screen). */
export const showImportValidator = vine.create({
  params: idParams(),
  resolution: vine.enum(IMPORT_RESOLUTIONS).optional(),
  rows: vine.boolean().optional(),
})

const splitLine = () =>
  vine.object({
    categoryId: id(),
    amountCents: signedCents(),
    memo: vine.string().trim().maxLength(255).nullable().optional(),
  })

/** What a person may decide for one row (keys left out keep the proposal). */
const decisionFields = {
  resolution: vine.enum(IMPORT_DECISIONS).optional(),
  categoryId: id().nullable().optional(),
  transferAccountId: id().nullable().optional(),
  matchTransactionId: id().nullable().optional(),
  paidByUserId: id().nullable().optional(),
  payee: vine.string().trim().maxLength(120).nullable().optional(),
  splits: vine.array(splitLine()).maxLength(50).optional(),
  learnRule: vine.boolean().optional(),
}

export const decideRowValidator = vine.create({
  params: vine.object({ id: id(), rowId: id() }),
  ...decisionFields,
})

/**
 * `PATCH /imports/:id/rows`: several rows' decisions at once, applied in one
 * database transaction. `reset` first drops the row's decision (back to the
 * importer's proposal), so an "Undo" can restore a row exactly.
 */
export const decideRowsValidator = vine.create({
  params: idParams(),
  changes: vine
    .array(vine.object({ rowId: id(), reset: vine.boolean().optional(), ...decisionFields }))
    .minLength(1)
    .maxLength(20_000),
})

export const confirmImportValidator = vine.create({
  params: idParams(),
  decisions: vine
    .array(vine.object({ rowId: id(), ...decisionFields }))
    .maxLength(20_000)
    .optional(),
})
