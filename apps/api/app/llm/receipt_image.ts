import { FieldError } from '#exceptions/field_error'
import { RECEIPT_MEDIA_TYPES, type ReceiptImage } from '#llm/types'

/** Vendor limit for inline images (MiniMax and Anthropic both accept 10 MB). */
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024

/** Longest side sent to the model: plenty for receipt text, cheaper in tokens. */
export const MAX_RECEIPT_SIDE = 1600

/**
 * Re-encodes a receipt photo before it goes to the model: checks the type
 * and size, applies the EXIF orientation, downscales to at most 1600 px on
 * the longest side, flattens transparency and re-encodes as JPEG, which
 * drops every metadata block (GPS, device). Works on in-memory buffers only:
 * the image is never written anywhere.
 *
 * `sharp` is loaded lazily so a missing native binary can only break receipt
 * scanning, never the boot of the app.
 */
export async function prepareReceiptImage(image: ReceiptImage): Promise<ReceiptImage> {
  if (!(RECEIPT_MEDIA_TYPES as readonly string[]).includes(image.mediaType)) {
    throw new FieldError('image', 'mimetype', { types: RECEIPT_MEDIA_TYPES.join(', ') })
  }

  const bytes = Buffer.from(stripDataUrl(image.base64), 'base64')
  if (bytes.length === 0) throw new FieldError('image', 'image')
  if (bytes.length > MAX_RECEIPT_BYTES) throw new FieldError('image', 'fileSize', { size: '10MB' })

  const { default: sharp } = await import('sharp')
  let output: Buffer
  try {
    output = await sharp(bytes, { failOn: 'error' })
      .rotate()
      .resize({
        width: MAX_RECEIPT_SIDE,
        height: MAX_RECEIPT_SIDE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 85 })
      .toBuffer()
  } catch {
    throw new FieldError('image', 'image')
  }

  return { base64: output.toString('base64'), mediaType: 'image/jpeg' }
}

function stripDataUrl(base64: string): string {
  const comma = base64.startsWith('data:') ? base64.indexOf(',') : -1
  return comma === -1 ? base64 : base64.slice(comma + 1)
}
