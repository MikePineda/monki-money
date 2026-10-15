import {
  JPEG_ENCODING,
  MAX_IMAGE_SIDE,
  WEBP_ENCODING,
  checkImageFile,
  encodedAs,
  encodingsToTry,
  targetSize,
} from './image-optimizer'

describe('target size', () => {
  it('test_a_photo_larger_than_the_limit_shrinks_so_its_longest_side_is_1600', () => {
    expect(targetSize(4032, 3024)).toEqual({ width: 1600, height: 1200 })
    expect(targetSize(3024, 4032)).toEqual({ width: 1200, height: 1600 })
  })

  it('test_the_aspect_ratio_is_kept_and_rounded_to_whole_pixels', () => {
    expect(targetSize(4000, 2999)).toEqual({ width: 1600, height: 1200 })
    expect(targetSize(1601, 1001)).toEqual({ width: 1600, height: 1000 })
  })

  it('test_a_photo_within_the_limit_is_never_upscaled', () => {
    expect(targetSize(1600, 900)).toEqual({ width: 1600, height: 900 })
    expect(targetSize(640, 480)).toEqual({ width: 640, height: 480 })
  })

  it('test_a_very_thin_image_keeps_at_least_one_pixel_per_side', () => {
    expect(targetSize(20000, 2)).toEqual({ width: 1600, height: 1 })
  })

  it('test_a_custom_limit_is_honoured', () => {
    expect(targetSize(1000, 500, 200)).toEqual({ width: 200, height: 100 })
  })

  it('test_an_image_without_pixels_is_refused', () => {
    expect(() => targetSize(0, 100)).toThrow(RangeError)
    expect(() => targetSize(100, Number.NaN)).toThrow(RangeError)
  })

  it('test_the_default_limit_is_1600_pixels', () => {
    expect(MAX_IMAGE_SIDE).toBe(1600)
  })
})

describe('encoding choice', () => {
  it('test_webp_at_0_8_is_tried_first_then_jpeg_at_0_82', () => {
    expect(encodingsToTry()).toEqual([
      { contentType: 'image/webp', quality: 0.8 },
      { contentType: 'image/jpeg', quality: 0.82 },
    ])
    expect(WEBP_ENCODING.quality).toBe(0.8)
    expect(JPEG_ENCODING.quality).toBe(0.82)
  })

  it('test_an_encoding_counts_only_when_the_browser_produced_that_type', () => {
    // Browsers that cannot write WebP silently hand back a PNG.
    expect(encodedAs(WEBP_ENCODING, 'image/webp')).toBe(true)
    expect(encodedAs(WEBP_ENCODING, 'image/png')).toBe(false)
    expect(encodedAs(JPEG_ENCODING, 'image/jpeg')).toBe(true)
    expect(encodedAs(JPEG_ENCODING, '')).toBe(false)
  })
})

describe('image file check', () => {
  it('test_any_image_type_passes', () => {
    expect(checkImageFile({ size: 2_000_000, type: 'image/jpeg' })).toBeNull()
    expect(checkImageFile({ size: 2_000_000, type: 'image/heic' })).toBeNull()
    expect(checkImageFile({ size: 2_000_000, type: 'image/png' })).toBeNull()
  })

  it('test_an_empty_file_or_a_file_that_is_not_an_image_is_refused', () => {
    expect(checkImageFile({ size: 0, type: 'image/jpeg' })).toBe('empty')
    expect(checkImageFile({ size: 100, type: 'application/pdf' })).toBe('notImage')
  })

  it('test_a_file_without_a_type_is_given_a_chance_since_some_cameras_omit_it', () => {
    expect(checkImageFile({ size: 100, type: '' })).toBeNull()
  })
})
