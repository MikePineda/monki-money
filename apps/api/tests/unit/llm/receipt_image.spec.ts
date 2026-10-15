import sharp from 'sharp'
import { test } from '@japa/runner'
import { FieldError } from '#exceptions/field_error'
import { prepareReceiptImage } from '#llm/receipt_image'

async function syntheticImage(width: number, height: number, format: 'png' | 'webp' | 'jpeg') {
  const image = sharp({
    create: { width, height, channels: 3, background: { r: 240, g: 240, b: 230 } },
  })
  const bytes = await image.toFormat(format).toBuffer()
  return bytes.toString('base64')
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('Expected a rejection')
}

test.group('LLM receipt image', () => {
  test('test_large_receipt_is_downscaled_to_1600px_on_its_longest_side', async ({ assert }) => {
    const prepared = await prepareReceiptImage({
      base64: await syntheticImage(2000, 3000, 'png'),
      mediaType: 'image/png',
    })

    const meta = await sharp(Buffer.from(prepared.base64, 'base64')).metadata()
    assert.equal(prepared.mediaType, 'image/jpeg')
    assert.equal(meta.format, 'jpeg')
    assert.equal(meta.height, 1600)
    assert.equal(meta.width, 1067)
  })

  test('test_small_receipt_keeps_its_size', async ({ assert }) => {
    const prepared = await prepareReceiptImage({
      base64: await syntheticImage(800, 600, 'webp'),
      mediaType: 'image/webp',
    })

    const meta = await sharp(Buffer.from(prepared.base64, 'base64')).metadata()
    assert.deepEqual([meta.width, meta.height], [800, 600])
  })

  test('test_receipt_metadata_is_stripped', async ({ assert }) => {
    const withExif = await sharp({
      create: { width: 100, height: 100, channels: 3, background: '#ffffff' },
    })
      .withExif({ IFD0: { Copyright: 'synthetic-owner' } })
      .jpeg()
      .toBuffer()
    const before = await sharp(withExif).metadata()
    assert.isDefined(before.exif)

    const prepared = await prepareReceiptImage({
      base64: withExif.toString('base64'),
      mediaType: 'image/jpeg',
    })
    const after = await sharp(Buffer.from(prepared.base64, 'base64')).metadata()
    assert.isUndefined(after.exif)
  })

  test('test_data_url_prefix_is_accepted', async ({ assert }) => {
    const base64 = await syntheticImage(10, 10, 'png')
    const prepared = await prepareReceiptImage({
      base64: `data:image/png;base64,${base64}`,
      mediaType: 'image/png',
    })
    assert.equal(prepared.mediaType, 'image/jpeg')
  })

  test('test_non_image_bytes_are_rejected', async ({ assert }) => {
    const error = await rejection(
      prepareReceiptImage({
        base64: Buffer.from('definitely not an image').toString('base64'),
        mediaType: 'image/jpeg',
      })
    )
    assert.instanceOf(error, FieldError)
    assert.equal((error as FieldError).field, 'image')
  })

  test('test_unsupported_media_type_is_rejected', async ({ assert }) => {
    const error = await rejection(
      prepareReceiptImage({
        base64: await syntheticImage(10, 10, 'png'),
        mediaType: 'application/pdf' as never,
      })
    )
    assert.instanceOf(error, FieldError)
    assert.equal((error as FieldError).rule, 'mimetype')
  })

  test('test_images_over_10_mb_are_rejected', async ({ assert }) => {
    const error = await rejection(
      prepareReceiptImage({
        base64: Buffer.alloc(10 * 1024 * 1024 + 1).toString('base64'),
        mediaType: 'image/png',
      })
    )
    assert.instanceOf(error, FieldError)
    assert.equal((error as FieldError).rule, 'fileSize')
  })
})
