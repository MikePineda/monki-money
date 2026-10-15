import vine from '@vinejs/vine'

/**
 * `POST /receipts/scan`. Only the shape is checked here; whether the key
 * belongs to the household (else 404) is the scanner's job.
 */
export const scanReceiptValidator = vine.create({
  key: vine.string().trim().minLength(1).maxLength(200),
})
