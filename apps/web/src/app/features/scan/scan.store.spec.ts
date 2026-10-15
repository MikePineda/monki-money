import { TestBed } from '@angular/core/testing'
import { TuyauHTTPError } from '@tuyau/core/client'
import { UploadNetworkError, type UploadResponse } from '../../core/api/upload.service'
import { ImageOptimizer, ImageUnreadableError } from '../../core/platform/image-optimizer'
import { OBJECT_URLS } from '../../core/platform/object-urls'
import { WINDOW } from '../../core/platform/window.token'
import type { OptimizedImage } from '../../domain/image-optimizer'
import type { ReceiptDraft } from '../../domain/receipt-draft'
import { ReceiptsApi, type PresignedUpload, type PutOptions } from './data-access/receipts.api'
import { ScanStore, type ScanStep } from './scan.store'

function httpError(status: number, body: unknown = {}) {
  const kyError = {
    response: { status, headers: new Headers() },
    request: { url: 'http://localhost/api/v1/receipts/scan', method: 'POST' },
    options: { prefixUrl: 'http://localhost' },
  }
  return new TuyauHTTPError(kyError as never, body)
}

const RECEIPT: ReceiptDraft = {
  merchant: 'Corner Grocer',
  date: '2026-09-14',
  totalCents: 2345,
  currencyCode: 'AUD',
  categoryId: 7,
  categorySlug: 'groceries',
  items: [{ description: 'Bananas 1kg', amountCents: 2345, quantity: 1 }],
  confidence: 0.9,
  key: 'receipts/1/first.webp',
}

function photo(type = 'image/jpeg', size = 3_000_000): File {
  const file = new File(['original pixels'], 'IMG_0001.jpg', { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

function presigned(key: string): PresignedUpload {
  return {
    key,
    url: `https://bucket.example.test/${key}?X-Amz-Signature=sig`,
    headers: { 'Content-Type': 'image/webp' },
    expiresAt: '2026-10-16T00:05:00.000Z',
  }
}

describe('ScanStore', () => {
  let api: {
    presign: ReturnType<typeof vi.fn>
    put: ReturnType<typeof vi.fn>
    scan: ReturnType<typeof vi.fn>
  }
  let optimizer: { optimize: ReturnType<typeof vi.fn> }
  let urls: { create: ReturnType<typeof vi.fn>; revoke: ReturnType<typeof vi.fn> }
  let view: { navigator: { onLine: boolean } }
  let optimized: OptimizedImage
  let steps: ScanStep['step'][]

  function setup() {
    optimized = {
      blob: new Blob(['small webp'], { type: 'image/webp' }),
      contentType: 'image/webp',
      width: 1200,
      height: 1600,
    }
    let keys = 0
    api = {
      presign: vi.fn(async () => presigned(`receipts/1/key-${++keys}.webp`)),
      put: vi.fn(async (): Promise<UploadResponse> => ({ status: 200, body: null })),
      scan: vi.fn(async (key: string) => ({ ...RECEIPT, key })),
    }
    optimizer = { optimize: vi.fn(async () => optimized) }
    urls = { create: vi.fn(() => 'blob:preview-1'), revoke: vi.fn() }
    view = { navigator: { onLine: true } }
    TestBed.configureTestingModule({
      providers: [
        ScanStore,
        { provide: ReceiptsApi, useValue: api },
        { provide: ImageOptimizer, useValue: optimizer },
        { provide: OBJECT_URLS, useValue: urls },
        { provide: WINDOW, useValue: view },
      ],
    })
    const store = TestBed.inject(ScanStore)
    steps = []
    const original = store.step.set.bind(store.step)
    store.step.set = (value: ScanStep) => {
      steps.push(value.step)
      original(value)
    }
    return store
  }

  it('test_a_file_that_is_not_an_image_never_leaves_the_device', async () => {
    const store = setup()

    await store.pick(photo('application/pdf'))

    expect(store.step()).toEqual({ step: 'error', problem: 'notImage', retryable: false })
    expect(optimizer.optimize).not.toHaveBeenCalled()
    expect(api.presign).not.toHaveBeenCalled()
  })

  it('test_a_photo_is_optimised_presigned_uploaded_and_scanned_in_that_order', async () => {
    const store = setup()

    await store.pick(photo())

    // A new photo first clears whatever the screen showed.
    expect(steps).toEqual(['idle', 'optimizing', 'presigning', 'uploading', 'scanning', 'review'])
    expect(api.presign).toHaveBeenCalledWith('image/webp', optimized.blob.size)
    expect(api.scan).toHaveBeenCalledWith('receipts/1/key-1.webp', expect.any(AbortSignal))
    expect(store.step()).toEqual({
      step: 'review',
      receipt: { ...RECEIPT, key: 'receipts/1/key-1.webp' },
    })
  })

  it('test_only_the_optimised_photo_goes_up_never_the_original', async () => {
    const store = setup()
    const original = photo()

    await store.pick(original)

    expect(optimizer.optimize).toHaveBeenCalledWith(original)
    expect(api.put).toHaveBeenCalledWith(
      presigned('receipts/1/key-1.webp'),
      optimized.blob,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
  })

  it('test_the_upload_reports_its_progress', async () => {
    const store = setup()
    let release!: () => void
    api.put.mockImplementationOnce(async (_upload: PresignedUpload, _blob: Blob, options: PutOptions) => {
      options.onProgress?.(0.5)
      await new Promise<void>((done) => (release = done))
      return { status: 200, body: null }
    })

    const scanning = store.pick(photo())
    await vi.waitFor(() => expect(store.step()).toEqual({ step: 'uploading', progress: 0.5 }))
    release()
    await scanning

    expect(store.step().step).toBe('review')
  })

  it('test_the_preview_shows_while_scanning_and_is_revoked_once_the_draft_is_back', async () => {
    const store = setup()
    let seen: string | null = null
    api.scan.mockImplementationOnce(async (key: string) => {
      seen = store.preview()
      return { ...RECEIPT, key }
    })

    await store.pick(photo())

    expect(seen).toBe('blob:preview-1')
    expect(urls.revoke).toHaveBeenCalledWith('blob:preview-1')
    expect(store.preview()).toBeNull()
  })

  it('test_an_expired_upload_url_is_presigned_again_once', async () => {
    const store = setup()
    api.put.mockResolvedValueOnce({ status: 403, body: null })

    await store.pick(photo())

    expect(api.presign).toHaveBeenCalledTimes(2)
    expect(api.put).toHaveBeenCalledTimes(2)
    expect(api.scan).toHaveBeenCalledWith('receipts/1/key-2.webp', expect.any(AbortSignal))
    expect(store.step().step).toBe('review')
  })

  it('test_a_second_refusal_of_the_bucket_is_an_upload_problem', async () => {
    const store = setup()
    api.put.mockResolvedValue({ status: 403, body: null })

    await store.pick(photo())

    expect(api.presign).toHaveBeenCalledTimes(2)
    expect(api.scan).not.toHaveBeenCalled()
    expect(store.step()).toEqual({ step: 'error', problem: 'upload', retryable: true })
  })

  it('test_offline_says_so_queues_nothing_and_retry_scans_once_back_online', async () => {
    const store = setup()
    view.navigator.onLine = false

    await store.pick(photo())

    expect(store.step()).toEqual({ step: 'error', problem: 'offline', retryable: true })
    expect(api.presign).not.toHaveBeenCalled()

    view.navigator.onLine = true
    await store.retry()

    expect(store.step().step).toBe('review')
  })

  it('test_a_dropped_connection_is_offline_and_retry_uploads_a_fresh_key_without_reoptimising', async () => {
    const store = setup()
    api.put.mockRejectedValueOnce(new UploadNetworkError())

    await store.pick(photo())
    expect(store.step()).toEqual({ step: 'error', problem: 'offline', retryable: true })
    expect(store.preview()).toBe('blob:preview-1')

    await store.retry()

    expect(optimizer.optimize).toHaveBeenCalledTimes(1)
    expect(api.presign).toHaveBeenCalledTimes(2)
    expect(api.scan).toHaveBeenCalledWith('receipts/1/key-2.webp', expect.any(AbortSignal))
  })

  it('test_402_reads_as_the_ai_limit', async () => {
    const store = setup()
    api.scan.mockRejectedValueOnce(httpError(402, { code: 'E_LLM_QUOTA_EXCEEDED' }))

    await store.pick(photo())

    expect(store.step()).toEqual({ step: 'error', problem: 'quota', retryable: false })
  })

  it('test_503_reads_as_scanning_unavailable_whether_the_model_or_the_bucket_is_down', async () => {
    const store = setup()
    api.scan.mockRejectedValueOnce(httpError(503, { code: 'E_LLM_UNAVAILABLE' }))
    await store.pick(photo())
    expect(store.step()).toEqual({ step: 'error', problem: 'unavailable', retryable: true })

    api.presign.mockRejectedValueOnce(httpError(503, { code: 'E_STORAGE_UNAVAILABLE' }))
    await store.retry()
    expect(store.step()).toEqual({ step: 'error', problem: 'unavailable', retryable: true })
  })

  it('test_422_reads_as_a_receipt_that_could_not_be_read', async () => {
    const store = setup()
    api.scan.mockRejectedValueOnce(
      httpError(422, { errors: [{ field: 'key', rule: 'image', message: 'Not an image' }] })
    )

    await store.pick(photo())

    expect(store.step()).toEqual({ step: 'error', problem: 'unreadable', retryable: false })
  })

  it('test_a_throttle_and_any_other_failure_can_be_retried', async () => {
    const store = setup()
    api.scan.mockRejectedValueOnce(httpError(429))
    await store.pick(photo())
    expect(store.step()).toEqual({ step: 'error', problem: 'throttled', retryable: true })

    api.scan.mockRejectedValueOnce(httpError(404, { code: 'E_ROW_NOT_FOUND' }))
    await store.retry()
    expect(store.step()).toEqual({ step: 'error', problem: 'failed', retryable: true })
  })

  it('test_a_photo_the_device_cannot_decode_asks_for_another_one', async () => {
    const store = setup()
    optimizer.optimize.mockRejectedValueOnce(new ImageUnreadableError())

    await store.pick(photo('image/heic'))

    expect(store.step()).toEqual({ step: 'error', problem: 'unreadablePhoto', retryable: false })
    expect(api.presign).not.toHaveBeenCalled()
  })

  it('test_cancel_aborts_the_upload_and_goes_back_to_the_capture', async () => {
    const store = setup()
    let signal: AbortSignal | undefined
    api.put.mockImplementationOnce(
      (_upload: PresignedUpload, _blob: Blob, options: PutOptions) =>
        new Promise((_resolve, reject) => {
          signal = options.signal
          options.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        })
    )

    const scanning = store.pick(photo())
    await vi.waitFor(() => expect(store.step().step).toBe('uploading'))
    store.cancel()
    await scanning

    expect(signal?.aborted).toBe(true)
    expect(store.step()).toEqual({ step: 'idle' })
    expect(urls.revoke).toHaveBeenCalledWith('blob:preview-1')
    expect(store.preview()).toBeNull()
    expect(api.scan).not.toHaveBeenCalled()
  })

  it('test_leaving_the_screen_mid_scan_aborts_it_and_revokes_the_preview', async () => {
    const store = setup()
    let signal: AbortSignal | undefined
    api.scan.mockImplementationOnce((_key: string, scanSignal: AbortSignal) => {
      signal = scanSignal
      return new Promise(() => undefined)
    })

    void store.pick(photo())
    await vi.waitFor(() => expect(store.step().step).toBe('scanning'))
    TestBed.resetTestingModule()

    expect(signal?.aborted).toBe(true)
    expect(urls.revoke).toHaveBeenCalledWith('blob:preview-1')
  })
})
