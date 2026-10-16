import { DOCUMENT, Injectable, inject } from '@angular/core'
import {
  encodedAs,
  encodingsToTry,
  targetSize,
  type ImageEncoding,
  type OptimizedImage,
} from '../../domain/image-optimizer'
import { OBJECT_URLS } from './object-urls'

/** The browser could not decode the picked file as an image (or could not encode it again). */
export class ImageUnreadableError extends Error {
  constructor() {
    super('The image could not be read')
    this.name = 'ImageUnreadableError'
  }
}

/** A decoded photo ready to draw, and how to let go of it once drawn. */
interface DecodedPhoto {
  source: CanvasImageSource
  width: number
  height: number
  release(): void
}

function toBlob(canvas: HTMLCanvasElement, encoding: ImageEncoding): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, encoding.contentType, encoding.quality))
}

/**
 * The browser half of the receipt photo optimiser (the math is in
 * `domain/image-optimizer.ts`): `createImageBitmap` decodes the photo with
 * its EXIF rotation applied, a canvas draws it at most 1600 px on its
 * longest side over a white page, and the canvas writes it as WebP (0.8)
 * or, where the browser cannot, JPEG (0.82). Redrawing drops every
 * metadata field (location, device), and the original is never uploaded.
 *
 * Where `createImageBitmap` refuses the photo (HEIC on Safari, which opens
 * it in an `<img>` all the same) or does not exist, an `<img>` decodes it
 * from a `blob:` URL revoked once it is drawn (images upright by their
 * EXIF rotation, the browsers' default). Only when both fail is the photo
 * unreadable.
 */
@Injectable({ providedIn: 'root' })
export class ImageOptimizer {
  private readonly document = inject(DOCUMENT)
  private readonly urls = inject(OBJECT_URLS)

  async optimize(photo: Blob): Promise<OptimizedImage> {
    const decoded = await this.decode(photo)
    const canvas = this.document.createElement('canvas')
    try {
      const size = targetSize(decoded.width, decoded.height)
      canvas.width = size.width
      canvas.height = size.height
      const context = canvas.getContext('2d')
      if (!context) {
        throw new ImageUnreadableError()
      }
      context.fillStyle = 'white'
      context.fillRect(0, 0, size.width, size.height)
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.drawImage(decoded.source, 0, 0, size.width, size.height)
      for (const encoding of encodingsToTry()) {
        const blob = await toBlob(canvas, encoding)
        if (blob && encodedAs(encoding, blob.type)) {
          return { blob, contentType: encoding.contentType, ...size }
        }
      }
      throw new ImageUnreadableError()
    } catch (error) {
      throw error instanceof ImageUnreadableError ? error : new ImageUnreadableError()
    } finally {
      decoded.release()
      // Frees the pixel buffer now instead of at the next collection (iOS caps canvas memory).
      canvas.width = 0
      canvas.height = 0
    }
  }

  /** `createImageBitmap` first, then an `<img>`; rejects with ImageUnreadableError when neither opens it. */
  private async decode(photo: Blob): Promise<DecodedPhoto> {
    if (typeof createImageBitmap === 'function') {
      try {
        const bitmap = await createImageBitmap(photo, { imageOrientation: 'from-image' })
        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          release: () => bitmap.close(),
        }
      } catch {
        // Not a format this decoder knows: the <img> decoder gets its turn.
      }
    }
    return this.decodeWithImage(photo)
  }

  private async decodeWithImage(photo: Blob): Promise<DecodedPhoto> {
    const url = this.urls.create(photo)
    const release = () => this.urls.revoke(url)
    const image = this.document.createElement('img')
    try {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new ImageUnreadableError())
        image.src = url
      })
    } catch {
      release()
      throw new ImageUnreadableError()
    } finally {
      image.onload = null
      image.onerror = null
    }
    if (!(image.naturalWidth > 0 && image.naturalHeight > 0)) {
      release()
      throw new ImageUnreadableError()
    }
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, release }
  }
}
