import vine from '@vinejs/vine'
import { UPLOAD_KINDS } from '#services/uploads/dto'
import { MAX_RECEIPT_BYTES } from '#llm/receipt_image'
import { RECEIPT_UPLOAD_TYPES } from '#domain/receipts/receipt_key'

/**
 * `POST /uploads/presign`. The size is the exact byte count of the file
 * the client will PUT (it becomes part of the signature), at most 10 MB.
 * A `key` in the body is ignored: the server always picks it.
 */
export const presignUploadValidator = vine.create({
  kind: vine.enum(UPLOAD_KINDS),
  contentType: vine.enum(RECEIPT_UPLOAD_TYPES),
  byteSize: vine.number().withoutDecimals().min(1).max(MAX_RECEIPT_BYTES),
})
