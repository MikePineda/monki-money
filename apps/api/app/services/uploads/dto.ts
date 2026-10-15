import type { ReceiptUploadType } from '#domain/receipts/receipt_key'

/** What can be uploaded straight to the bucket. Receipts only, today. */
export const UPLOAD_KINDS = ['receipt'] as const
export type UploadKind = (typeof UPLOAD_KINDS)[number]

/** `POST /uploads/presign`: what the client is about to upload. */
export interface PresignUploadInput {
  kind: UploadKind
  contentType: ReceiptUploadType
  /** Exact size in bytes of the file the client will PUT. */
  byteSize: number
}

/** Where and how to PUT the file, and until when the URL works. */
export interface PresignedUpload {
  key: string
  url: string
  /** Send these headers with the PUT, verbatim (they are signed). */
  headers: Record<string, string>
  /** ISO-8601 UTC. */
  expiresAt: string
}
