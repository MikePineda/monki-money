/**
 * Receipt photo optimisation, the pure part. Pure: no Angular, no DOM.
 * A photo never leaves the device as taken: it is decoded with its EXIF
 * rotation applied, scaled down so its longest side is at most
 * {@link MAX_IMAGE_SIDE} pixels, drawn on a canvas (which drops every
 * metadata field) and written as WebP, or JPEG where the browser cannot
 * write WebP. The canvas work lives in `core/platform/image-optimizer.ts`.
 */

/** The longest side of an uploaded receipt photo, in pixels. */
export const MAX_IMAGE_SIDE = 1600

/** What the bucket accepts from the optimiser. */
export type OptimizedImageType = 'image/webp' | 'image/jpeg'

/** A format and quality to ask the canvas for. */
export interface ImageEncoding {
  contentType: OptimizedImageType
  quality: number
}

export const WEBP_ENCODING: ImageEncoding = { contentType: 'image/webp', quality: 0.8 }
export const JPEG_ENCODING: ImageEncoding = { contentType: 'image/jpeg', quality: 0.82 }

/** What the optimiser hands to the upload: the bytes, their type and their size in pixels. */
export interface OptimizedImage {
  blob: Blob
  contentType: OptimizedImageType
  width: number
  height: number
}

export interface PixelSize {
  width: number
  height: number
}

/**
 * The size to draw a `width × height` image at: unchanged when its longest
 * side is within `maxSide`, otherwise scaled down keeping the aspect ratio
 * (whole pixels, at least one per side). Never scales up.
 */
export function targetSize(width: number, height: number, maxSide = MAX_IMAGE_SIDE): PixelSize {
  if (!(width > 0) || !(height > 0)) {
    throw new RangeError('An image needs a width and a height')
  }
  const longest = Math.max(width, height)
  if (longest <= maxSide) {
    return { width: Math.round(width), height: Math.round(height) }
  }
  const scale = maxSide / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** The encodings to ask for, best first: WebP at 0.8, then JPEG at 0.82. */
export function encodingsToTry(): ImageEncoding[] {
  return [{ ...WEBP_ENCODING }, { ...JPEG_ENCODING }]
}

/**
 * Whether the canvas really wrote the encoding asked for. A browser that
 * cannot write WebP answers with a PNG instead of failing, so the type of
 * the produced blob is the only reliable test.
 */
export function encodedAs(encoding: ImageEncoding, producedType: string): boolean {
  return producedType === encoding.contentType
}

export type ImageFileProblem = 'empty' | 'notImage'

/**
 * Why a picked file cannot be a receipt photo, or null when it may be one.
 * Any image type is worth decoding (HEIC included, where the browser reads
 * it); a file without a type gets the same chance, since some cameras and
 * file pickers leave it blank. Whether it really is an image is known only
 * once it is decoded.
 */
export function checkImageFile(file: { size: number; type: string }): ImageFileProblem | null {
  if (file.type !== '' && !file.type.startsWith('image/')) {
    return 'notImage'
  }
  if (file.size === 0) {
    return 'empty'
  }
  return null
}
