/**
 * Object keys of receipt photos in the private bucket:
 * `receipts/<householdId>/<uuid>.<ext>`. The server always generates them
 * (the client never chooses a key), the household id in the path is what
 * scoping checks, and the top-level `receipts/` prefix is what the bucket's
 * one-day lifecycle rule expires (bank CSVs live under `imports/`).
 *
 * The photo types the client may upload (and the 10 MB limit) are shared
 * with the web, which checks them before asking for a presigned URL.
 */
import {
  RECEIPT_UPLOAD_TYPES,
  isReceiptUploadType,
  type ReceiptUploadType,
} from '@monkimoney/shared'

export { RECEIPT_UPLOAD_TYPES, isReceiptUploadType, type ReceiptUploadType }

/** Every receipt photo lives under this prefix (lifecycle rule `expire-receipts`). */
export const RECEIPTS_PREFIX = 'receipts/'

const EXTENSIONS: Record<ReceiptUploadType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/** Household id (no leading zero, fits `integer`) / lowercase uuid . extension. */
const KEY_PATTERN =
  /^receipts\/([1-9]\d{0,9})\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp)$/

const MAX_ID = 2_147_483_647

/** The key for a new receipt photo; `id` is a fresh uuid chosen by the caller. */
export function receiptKey(householdId: number, id: string, contentType: ReceiptUploadType) {
  return `${RECEIPTS_PREFIX}${householdId}/${id}.${EXTENSIONS[contentType]}`
}

/**
 * The household a receipt key belongs to, or null for anything that is not
 * exactly a key `receiptKey` could have generated (other prefixes, extra
 * segments, `..`, query strings, stray whitespace).
 */
export function receiptKeyHousehold(key: string): number | null {
  const match = KEY_PATTERN.exec(key)
  if (!match) return null
  const householdId = Number(match[1])
  return householdId <= MAX_ID ? householdId : null
}
