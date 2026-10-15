import { Injectable, inject } from '@angular/core'
import { API } from '../../../core/api/api'
import type { Transaction } from '../../../core/api/api-types'
import { UploadService, type UploadResponse } from '../../../core/api/upload.service'
import type { OptimizedImageType } from '../../../domain/image-optimizer'
import type { ReceiptDraft, ReceiptSplit } from '../../../domain/receipt-draft'

/** `POST /uploads/presign`: where and how to PUT the photo, until `expiresAt`. */
export interface PresignedUpload {
  key: string
  url: string
  /** Signed headers: send them verbatim with the PUT. */
  headers: Record<string, string>
  expiresAt: string
}

/** `POST /transactions` for a reviewed receipt (`source: 'receipt'`). */
export interface ReceiptTransactionInput {
  clientId: string
  kind: 'expense' | 'income'
  accountId: number
  date: string
  amountCents: number
  categoryId: number | null
  splits?: ReceiptSplit[]
  payee: string | null
  description: string | null
  paidByUserId: number | null
  isPrivate: boolean
  tags: string[]
  source: 'receipt'
}

export interface PutOptions {
  onProgress?: (fraction: number | null) => void
  signal?: AbortSignal
}

/**
 * Data access for the receipt scanner (docs/CONTRACTS.md, "Receipts and
 * uploads"): presign a direct upload, PUT the photo to the bucket through
 * the XHR upload service (real progress, no session cookies), scan the
 * uploaded key, and save the reviewed transaction. Thin: every API call is
 * one typed Tuyau call.
 */
@Injectable({ providedIn: 'root' })
export class ReceiptsApi {
  private readonly api = inject(API)
  private readonly uploads = inject(UploadService)

  async presign(contentType: OptimizedImageType, byteSize: number): Promise<PresignedUpload> {
    const { data } = await (
      await this.api()
    ).request('uploads.presign', { body: { kind: 'receipt', contentType, byteSize } })
    return data
  }

  /** PUTs the photo; every HTTP answer resolves (network failures and aborts reject). */
  put(upload: PresignedUpload, blob: Blob, options: PutOptions = {}): Promise<UploadResponse> {
    return this.uploads.putToUrl(upload.url, blob, upload.headers, options)
  }

  /** Reads the uploaded photo into a draft; the API deletes the photo whatever happens. */
  async scan(key: string, signal?: AbortSignal): Promise<ReceiptDraft> {
    const { data } = await (await this.api()).request('receipts.scan', { body: { key }, signal })
    return data
  }

  async save(body: ReceiptTransactionInput): Promise<Transaction> {
    const { data } = await (await this.api()).request('transactions.store', { body })
    return data
  }
}
