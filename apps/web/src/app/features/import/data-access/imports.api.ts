import { Injectable, inject } from '@angular/core'
import { API } from '../../../core/api/api'
import type { ImportBatch, ImportBatchDetail, ImportRow } from '../../../core/api/api-types'
import { UploadService } from '../../../core/api/upload.service'
import type { ConfirmDecision, Reconciliation, RowChange } from '../../../domain/import-row'
import { uploadOutcome, type UploadOutcome } from '../../../domain/import-upload'

/** `POST /imports/:id/confirm`: what the batch became in the ledger. */
export interface ConfirmResult {
  batchId: number
  status: string
  created: number
  matched: number
  ignored: number
  transfers: number
  remaining: number
  reconciliation: Reconciliation
}

export interface UploadRequest {
  file: File
  /** The account the file belongs to; null lets the API read its account number. */
  accountId: number | null
  onProgress?: (fraction: number | null) => void
  signal?: AbortSignal
}

/**
 * Data access for bank imports (`/imports`, see docs/CONTRACTS.md "Bank
 * imports and merchant rules"). The CSV goes up through the XHR upload
 * service (real progress, cancel); every other call is one typed Tuyau call.
 */
@Injectable({ providedIn: 'root' })
export class ImportsApi {
  private readonly api = inject(API)
  private readonly uploads = inject(UploadService)

  /** Uploads the CSV; every HTTP answer becomes an outcome (network failures throw). */
  async upload(request: UploadRequest): Promise<UploadOutcome<ImportBatch>> {
    const client = await this.api()
    const { url } = client.getRoute('imports.store', {})
    const form = new FormData()
    // Fields before the file: the API reads the multipart stream in order.
    if (request.accountId !== null) {
      form.append('accountId', String(request.accountId))
    }
    form.append('file', request.file, request.file.name)
    const response = await this.uploads.post(url, form, {
      onProgress: request.onProgress,
      signal: request.signal,
    })
    return uploadOutcome<ImportBatch>(response.status, response.body)
  }

  /** Batches still waiting for review, newest first. */
  async staged(): Promise<ImportBatch[]> {
    const { data } = await (
      await this.api()
    ).request('imports.index', { query: { status: 'staged', perPage: 20 } })
    return data
  }

  async show(id: number, signal?: AbortSignal): Promise<ImportBatchDetail> {
    const { data } = await (await this.api()).request('imports.show', { params: { id }, signal })
    return data
  }

  /** Stores a person's decision on one row; answers the row as the API now sees it. */
  async decide(id: number, rowId: number, change: RowChange): Promise<ImportRow> {
    const { data } = await (
      await this.api()
    ).request('imports.rows.update', { params: { id, rowId }, body: change })
    return data
  }

  /** Starts the model's classification (202). */
  async classify(id: number): Promise<ImportBatch> {
    const { data } = await (await this.api()).request('imports.classify', { params: { id } })
    return data
  }

  async confirm(id: number, decisions: ConfirmDecision[]): Promise<ConfirmResult> {
    const body = await (
      await this.api()
    ).request('imports.confirm', { params: { id }, body: { decisions } })
    return body.data as ConfirmResult
  }

  async cancel(id: number): Promise<ImportBatch> {
    const { data } = await (await this.api()).request('imports.cancel', { params: { id } })
    return data
  }
}
