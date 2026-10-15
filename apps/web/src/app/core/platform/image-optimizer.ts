import { DOCUMENT, Injectable, inject } from '@angular/core'
import {
  encodedAs,
  encodingsToTry,
  targetSize,
  type ImageEncoding,
  type OptimizedImage,
} from '../../domain/image-optimizer'

/** The browser could not decode the picked file as an image (or could not encode it again). */
export class ImageUnreadableError extends Error {
  constructor() {
    super('The image could not be read')
    this.name = 'ImageUnreadableError'
  }
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
 */
@Injectable({ providedIn: 'root' })
export class ImageOptimizer {
  private readonly document = inject(DOCUMENT)

  async optimize(photo: Blob): Promise<OptimizedImage> {
    let bitmap: ImageBitmap
    try {
      bitmap = await createImageBitmap(photo, { imageOrientation: 'from-image' })
    } catch {
      throw new ImageUnreadableError()
    }
    const canvas = this.document.createElement('canvas')
    try {
      const size = targetSize(bitmap.width, bitmap.height)
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
      context.drawImage(bitmap, 0, 0, size.width, size.height)
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
      bitmap.close()
      // Frees the pixel buffer now instead of at the next collection (iOS caps canvas memory).
      canvas.width = 0
      canvas.height = 0
    }
  }
}
