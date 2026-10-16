import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core'
import { receiptUploadProblem, type ReceiptUploadProblem } from '@monkimoney/shared'
import { hasStatus, toApiError } from '../../core/api/http-errors'
import { UploadAbortedError, UploadNetworkError } from '../../core/api/upload.service'
import { ImageOptimizer, ImageUnreadableError } from '../../core/platform/image-optimizer'
import { OBJECT_URLS } from '../../core/platform/object-urls'
import { WINDOW } from '../../core/platform/window.token'
import {
  checkImageFile,
  undecodableFormat,
  type OptimizedImage,
} from '../../domain/image-optimizer'
import type { ReceiptDraft } from '../../domain/receipt-draft'
import { ReceiptsApi } from './data-access/receipts.api'

/**
 * Why a scan stopped:
 * - `notImage`: the picked file is not a photo (or is empty);
 * - `unreadablePhoto`: the device could not open the photo (with its
 *   `format` when that is the reason, such as HEIC on a browser without it);
 * - `tooLarge` / `wrongType`: the reduced photo is over the upload limit
 *   (10 MB) or of a type the bucket does not take (said before any upload);
 * - `offline`: no connection (scanning needs the network; nothing is queued);
 * - `quota`: the household's AI limit for the month (402);
 * - `unavailable`: the model or the bucket is down (503);
 * - `unreadable`: the model could not read the receipt (422);
 * - `throttled`: too many scans in a minute (429);
 * - `upload`: the bucket refused the photo (even with a fresh URL), or the
 *   browser could not reach it while online (a bucket without the CORS rule);
 * - `failed`: anything else.
 */
export type ScanProblem =
  | 'notImage'
  | 'unreadablePhoto'
  | 'tooLarge'
  | 'wrongType'
  | 'offline'
  | 'quota'
  | 'unavailable'
  | 'unreadable'
  | 'throttled'
  | 'upload'
  | 'failed'

/** Where the scan is; `retryable` says whether the same photo is worth sending again. */
export type ScanStep =
  | { step: 'idle' }
  | { step: 'optimizing' }
  | { step: 'presigning' }
  | { step: 'uploading'; progress: number | null }
  | { step: 'scanning' }
  | { step: 'review'; receipt: ReceiptDraft }
  | { step: 'error'; problem: ScanProblem; retryable: boolean; format?: string }

/** Problems a second try with the same photo cannot fix. */
const FINAL: ReadonlySet<ScanProblem> = new Set([
  'notImage',
  'unreadablePhoto',
  'tooLarge',
  'wrongType',
  'quota',
  'unreadable',
])

const WORKING: ReadonlySet<ScanStep['step']> = new Set([
  'optimizing',
  'presigning',
  'uploading',
  'scanning',
])

const UPLOAD_PROBLEMS: Record<ReceiptUploadProblem, ScanProblem> = {
  size: 'tooLarge',
  type: 'wrongType',
}

/** The bucket answered the PUT with something other than 2xx. */
class BucketRefusedError extends Error {
  constructor(readonly status: number) {
    super(`The bucket refused the upload (${status})`)
    this.name = 'BucketRefusedError'
  }
}

/** The reduced photo breaks the shared upload limits: nothing is asked of the API. */
class OutsideUploadLimitsError extends Error {
  constructor(readonly problem: ReceiptUploadProblem) {
    super(`The photo cannot be uploaded (${problem})`)
    this.name = 'OutsideUploadLimitsError'
  }
}

/** The scan was cancelled or replaced; whatever it was doing no longer matters. */
class SupersededError extends Error {}

/**
 * The capture half of the receipt scanner `/scan`: picks a photo, reduces
 * it on the device (never the original goes up), checks it against the
 * shared upload limits, asks the API for a presigned URL sized to the
 * reduced photo, PUTs it straight to the bucket with real progress, and
 * asks the API to read it.
 *
 * `idle → optimizing → presigning → uploading(progress) → scanning →
 * review | error`. A 403 from the bucket (the five-minute URL expired) gets
 * one fresh URL. Scanning needs the network: offline is said, never queued,
 * and "Try again" uploads the same reduced photo under a new key (each key
 * scans once). Cancel aborts whatever is in flight.
 *
 * The photo lives in memory only, as `blob:` URLs, and is never persisted:
 * the original's preview while it is read (revoked once the draft is
 * back), then the reduced copy (`reviewPhoto`) while the review is open, to
 * compare with the fields. Both go on cancel, on discard, with a new photo
 * and when the screen goes away. Provided by the page.
 */
@Injectable()
export class ScanStore {
  private readonly api = inject(ReceiptsApi)
  private readonly optimizer = inject(ImageOptimizer)
  private readonly urls = inject(OBJECT_URLS)
  private readonly window = inject(WINDOW)

  readonly step = signal<ScanStep>({ step: 'idle' })
  /** The picked photo, shown while it is read. */
  readonly preview = signal<string | null>(null)
  /** The reduced photo (what was read), kept while the review is open. */
  readonly reviewPhoto = signal<string | null>(null)
  readonly busy = computed(() => WORKING.has(this.step().step))

  private photo: File | null = null
  private optimized: OptimizedImage | null = null
  private controller: AbortController | null = null

  constructor() {
    inject(DestroyRef).onDestroy(() => this.reset())
  }

  /** Starts over with a new photo. */
  async pick(file: File): Promise<void> {
    this.reset()
    if (checkImageFile(file) !== null) {
      this.step.set({ step: 'error', problem: 'notImage', retryable: false })
      return
    }
    this.photo = file
    this.preview.set(this.urls.create(file))
    await this.run()
  }

  /** Sends the same photo again (a new upload: each key scans once). */
  async retry(): Promise<void> {
    if (this.photo !== null) {
      await this.run()
    }
  }

  /** Stops whatever is in flight and goes back to the capture. */
  cancel(): void {
    this.reset()
  }

  /** Back to the capture with nothing kept: aborts, forgets the photo, revokes its URLs. */
  reset(): void {
    this.controller?.abort()
    this.controller = null
    this.forgetPhoto()
    this.releaseReviewPhoto()
    this.step.set({ step: 'idle' })
  }

  private async run(): Promise<void> {
    this.controller?.abort()
    const controller = new AbortController()
    this.controller = controller
    const live = () => {
      if (this.controller !== controller) {
        throw new SupersededError()
      }
    }

    if (this.window.navigator.onLine === false) {
      this.fail({ problem: 'offline' })
      this.controller = null
      return
    }
    try {
      const image = await this.optimize(live)
      const key = await this.upload(image, controller.signal, live)
      this.step.set({ step: 'scanning' })
      const receipt = await this.api.scan(key, controller.signal)
      live()
      this.controller = null
      // The draft is back: the original goes, the reduced copy stays for the review.
      this.forgetPhoto()
      this.reviewPhoto.set(this.urls.create(image.blob))
      this.step.set({ step: 'review', receipt })
    } catch (error) {
      if (this.controller !== controller) {
        return
      }
      this.controller = null
      this.fail(this.problemOf(error))
    }
  }

  private async optimize(live: () => void): Promise<OptimizedImage> {
    if (this.optimized) {
      return this.optimized
    }
    this.step.set({ step: 'optimizing' })
    const image = await this.optimizer.optimize(this.photo as Blob)
    live()
    this.optimized = image
    return image
  }

  /**
   * Checks the shared upload limits, presigns and PUTs the photo; a 403
   * (expired URL) gets one fresh URL. Resolves with the key.
   */
  private async upload(
    image: OptimizedImage,
    signal: AbortSignal,
    live: () => void
  ): Promise<string> {
    const outside = receiptUploadProblem({ type: image.contentType, size: image.blob.size })
    if (outside !== null) {
      throw new OutsideUploadLimitsError(outside)
    }
    for (let attempt = 1; ; attempt += 1) {
      this.step.set({ step: 'presigning' })
      const upload = await this.api.presign(image.contentType, image.blob.size)
      live()
      this.step.set({ step: 'uploading', progress: 0 })
      const response = await this.api.put(upload, image.blob, {
        signal,
        onProgress: (progress) => this.progress(progress),
      })
      live()
      if (response.status >= 200 && response.status < 300) {
        return upload.key
      }
      if (response.status !== 403 || attempt > 1) {
        throw new BucketRefusedError(response.status)
      }
    }
  }

  private progress(progress: number | null): void {
    this.step.update((current) =>
      current.step === 'uploading' ? { ...current, progress } : current
    )
  }

  private problemOf(error: unknown): { problem: ScanProblem; format?: string } {
    if (error instanceof ImageUnreadableError) {
      const format = this.photo ? undecodableFormat(this.photo) : null
      return format === null
        ? { problem: 'unreadablePhoto' }
        : { problem: 'unreadablePhoto', format }
    }
    if (error instanceof OutsideUploadLimitsError) {
      return { problem: UPLOAD_PROBLEMS[error.problem] }
    }
    if (error instanceof UploadNetworkError) {
      // A bucket that refuses the browser (no CORS rule) fails like a dropped
      // connection; while the device is online, say the upload failed instead.
      return { problem: this.window.navigator.onLine === false ? 'offline' : 'upload' }
    }
    if (error instanceof BucketRefusedError) {
      return { problem: 'upload' }
    }
    if (error instanceof UploadAbortedError) {
      return { problem: 'failed' }
    }
    const failure = toApiError(error)
    switch (failure.kind) {
      case 'offline':
        return { problem: 'offline' }
      case 'validation':
        return { problem: 'unreadable' }
      case 'throttled':
        return { problem: 'throttled' }
      default:
        if (hasStatus(failure, 402)) {
          return { problem: 'quota' }
        }
        return { problem: hasStatus(failure, 503) ? 'unavailable' : 'failed' }
    }
  }

  private fail({ problem, format }: { problem: ScanProblem; format?: string }): void {
    const retryable = !FINAL.has(problem)
    this.step.set(
      format === undefined
        ? { step: 'error', problem, retryable }
        : { step: 'error', problem, retryable, format }
    )
  }

  /** Drops the original photo and its preview (the reduced copy is the review's to release). */
  private forgetPhoto(): void {
    const preview = this.preview()
    if (preview !== null) {
      this.urls.revoke(preview)
      this.preview.set(null)
    }
    this.photo = null
    this.optimized = null
  }

  private releaseReviewPhoto(): void {
    const photo = this.reviewPhoto()
    if (photo !== null) {
      this.urls.revoke(photo)
      this.reviewPhoto.set(null)
    }
  }
}
