import vine from '@vinejs/vine'
import { MAX_RECEIPT_BYTES, RECEIPT_UPLOAD_TYPES } from '@monkimoney/shared'
import { UPLOAD_KINDS } from '#services/uploads/dto'

/**
 * `POST /uploads/presign`. The size is the exact byte count of the file
 * the client will PUT (it becomes part of the signature), at most 10 MB
 * (the limits live in @monkimoney/shared: the web checks them first).
 * A `key` in the body is ignored: the server always picks it.
 */
export const presignUploadValidator = vine.create({
  kind: vine.enum(UPLOAD_KINDS),
  contentType: vine.enum(RECEIPT_UPLOAD_TYPES),
  byteSize: vine.number().withoutDecimals().min(1).max(MAX_RECEIPT_BYTES),
})
