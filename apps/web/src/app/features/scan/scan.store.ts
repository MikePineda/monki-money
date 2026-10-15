import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core'
import { hasStatus, toApiError } from '../../core/api/http-errors'
import { UploadAbortedError, UploadNetworkError } from '../../core/api/upload.service'
import { ImageOptimizer, ImageUnreadableError } from '../../core/platform/image-optimizer'
import { OBJECT_URLS } from '../../core/platform/object-urls'
import { WINDOW } from '../../core/platform/window.token'
import { checkImageFile, type OptimizedImage } from '../../domain/image-optimizer'
import type { ReceiptDraft } from '../../domain/receipt-draft'
import { ReceiptsApi } from './data-access/receipts.api'

/**
 * Why a scan stopped:
 * - `notImage`: the picked file is not a photo (or is empty);
 * - `unreadablePhoto`: the device could not open the photo;
 * - `offline`: no connection (scanning needs the network; nothing is queued);
 * - `quota`: the household's AI limit for the month (402);
 * - `unavailable`: the model or the bucket is down (503);
 * - `unreadable`: the model could not read the receipt (422);
 * - `throttled`: too many scans in a minute (429);
 * - `upload`: the bucket refused the photo, even with a fresh URL;
 * - `failed`: anything else.
 */
export type ScanProblem =
  | 'notImage'
  | 'unreadablePhoto'
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
  | { step: 'error'; problem: ScanProblem; retryable: boolean }

/** Problems a second try with the same photo cannot fix. */
const FINAL: ReadonlySet<ScanProblem> = new Set(['notImage', 'unreadablePhoto', 'quota', 'unreadable'])

const WORKING: ReadonlySet<ScanStep['step']> = new Set([
  'optimizing',
  'presigning',
  'uploading',
  'scanning',
])

/** The bucket answered the PUT with something other than 2xx. */
class BucketRefusedError extends Error {
  constructor(readonly status: number) {
    super(`The bucket refused the upload (${status})`)
    this.name = 'BucketRefusedError'
  }
}

/** The scan was cancelled or replaced; whatever it was doing no longer matters. */
class SupersededError extends Error {}

/**
 * The capture half of the receipt scanner `/scan`: picks a photo, reduces
 * it on the device (never the original goes up), asks the API for a
 * presigned URL sized to the reduced photo, PUTs it straight to the bucket
 * with real progress, and asks the API to read it.
 *
 * `idle → optimizing → presigning → uploading(progress) → scanning →
 * review | error`. A 403 from the bucket (the five-minute URL expired) gets
 * one fresh URL. Scanning needs the network: offline is said, never queued,
 * and "Try again" uploads the same reduced photo under a new key (each key
 * scans once). Cancel aborts whatever is in flight. The local preview is a
 * `blob:` URL revoked as soon as the draft is back, on cancel and when the
 * screen goes away: nothing of the photo stays on the device. Provided by
 * the page.
 */
@Injectable()
export class ScanStore {
  private readonly api = inject(ReceiptsApi)
  private readonly optimizer = inject(ImageOptimizer)
  private readonly urls = inject(OBJECT_URLS)
  private readonly window = inject(WINDOW)

  readonly step = signal<ScanStep>({ step: 'idle' })
  /** The picked photo, shown while it is being read. */
  readonly preview = signal<string | null>(null)
  readonly busy = computed(() => WORKING.has(this.step().step))

  private photo: Blob | null = null
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

  /** Back to the capture with nothing kept: aborts, forgets the photo, revokes the preview. */
  reset(): void {
    this.controller?.abort()
    this.controller = null
    this.forgetPhoto()
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
      // The draft is back: nothing of the photo is kept any longer.
      this.forgetPhoto()
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

  /** Presigns and PUTs the photo; a 403 (expired URL) gets one fresh URL. Resolves with the key. */
  private async upload(
    image: OptimizedImage,
    signal: AbortSignal,
    live: () => void
  ): Promise<string> {
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

  private problemOf(error: unknown): { problem: ScanProblem } {
    if (error instanceof ImageUnreadableError) {
      return { problem: 'unreadablePhoto' }
    }
    if (error instanceof UploadNetworkError) {
      return { problem: 'offline' }
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

  private fail({ problem }: { problem: ScanProblem }): void {
    this.step.set({ step: 'error', problem, retryable: !FINAL.has(problem) })
  }

  private forgetPhoto(): void {
    const preview = this.preview()
    if (preview !== null) {
      this.urls.revoke(preview)
      this.preview.set(null)
    }
    this.photo = null
    this.optimized = null
  }
}
