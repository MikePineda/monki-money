import type { ReceiptExtraction } from '#llm/types'

/** `POST /receipts/scan`: the key `POST /uploads/presign` handed out. */
export interface ScanReceiptInput {
  key: string
}

/**
 * The draft of a transaction read from the photo (nothing is stored):
 * amounts in integer cents, `date` as YYYY-MM-DD, null when unreadable.
 * `categoryId` is the household's category for `categorySlug`.
 */
export interface ScannedReceipt extends ReceiptExtraction {
  categoryId: number | null
  key: string
}
