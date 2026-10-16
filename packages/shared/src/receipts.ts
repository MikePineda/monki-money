/**
 * Receipt photo uploads: what the bucket accepts. The API validates
 * `POST /uploads/presign` and re-checks the stored object against these
 * limits; the web checks its reduced photo before asking for a presigned
 * URL, so a refusal is said on the device without a round trip.
 */

/** Photo types a receipt upload may have (the web re-encodes to WebP or JPEG first). */
export const RECEIPT_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export type ReceiptUploadType = (typeof RECEIPT_UPLOAD_TYPES)[number]

/** The largest receipt photo, 10 MB (also what the model vendors accept inline). */
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024

/** Why a file cannot go up as a receipt photo: its type, or its size (empty or over 10 MB). */
export type ReceiptUploadProblem = 'type' | 'size'

export function isReceiptUploadType(value: unknown): value is ReceiptUploadType {
  return typeof value === 'string' && (RECEIPT_UPLOAD_TYPES as readonly string[]).includes(value)
}

/** Why `file` cannot be uploaded as a receipt photo, or null when it can. */
export function receiptUploadProblem(file: {
  type: string
  size: number
}): ReceiptUploadProblem | null {
  if (!isReceiptUploadType(file.type)) {
    return 'type'
  }
  return file.size >= 1 && file.size <= MAX_RECEIPT_BYTES ? null : 'size'
}
