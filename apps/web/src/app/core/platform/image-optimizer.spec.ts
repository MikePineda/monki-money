import { DOCUMENT } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { ImageOptimizer, ImageUnreadableError } from './image-optimizer'

/** A canvas that records what was drawn and answers toBlob like a browser would. */
class FakeCanvas {
  width = 0
  height = 0
  readonly context = {
    fillStyle: '',
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  }
  readonly requested: { type: string; quality: number }[] = []

  constructor(private readonly writesWebp: boolean) {}

  getContext(kind: string) {
    return kind === '2d' ? this.context : null
  }

  toBlob(callback: (blob: Blob | null) => void, type: string, quality: number): void {
    this.requested.push({ type, quality })
    // A browser that cannot write WebP falls back to PNG without an error.
    const produced = type === 'image/webp' && !this.writesWebp ? 'image/png' : type
    callback(new Blob([`${this.width}x${this.height}`], { type: produced }))
  }
}

describe('ImageOptimizer', () => {
  let canvas: FakeCanvas
  let bitmap: { width: number; height: number; close: ReturnType<typeof vi.fn> }
  let decode: ReturnType<typeof vi.fn>

  function setup(options: { writesWebp?: boolean; width?: number; height?: number } = {}) {
    canvas = new FakeCanvas(options.writesWebp ?? true)
    bitmap = { width: options.width ?? 4032, height: options.height ?? 3024, close: vi.fn() }
    decode = vi.fn(() => Promise.resolve(bitmap))
    vi.stubGlobal('createImageBitmap', decode)
    TestBed.configureTestingModule({
      providers: [
        {
          provide: DOCUMENT,
          useValue: { createElement: (tag: string) => (tag === 'canvas' ? canvas : null) },
        },
      ],
    })
    return TestBed.inject(ImageOptimizer)
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('test_decodes_with_the_exif_rotation_applied_so_the_photo_is_upright', async () => {
    const optimizer = setup()
    const photo = new Blob(['photo'], { type: 'image/jpeg' })

    await optimizer.optimize(photo)

    expect(decode).toHaveBeenCalledWith(photo, { imageOrientation: 'from-image' })
  })

  it('test_a_large_photo_is_drawn_at_1600_pixels_on_its_longest_side_and_written_as_webp', async () => {
    const optimizer = setup()

    const result = await optimizer.optimize(new Blob(['photo'], { type: 'image/jpeg' }))

    expect(canvas.context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1600, 1200)
    expect(canvas.requested).toEqual([{ type: 'image/webp', quality: 0.8 }])
    expect(result.contentType).toBe('image/webp')
    expect(result.blob.type).toBe('image/webp')
    expect({ width: result.width, height: result.height }).toEqual({ width: 1600, height: 1200 })
  })

  it('test_falls_back_to_jpeg_at_0_82_where_the_browser_cannot_write_webp', async () => {
    const optimizer = setup({ writesWebp: false, width: 900, height: 1200 })

    const result = await optimizer.optimize(new Blob(['photo'], { type: 'image/png' }))

    expect(canvas.requested).toEqual([
      { type: 'image/webp', quality: 0.8 },
      { type: 'image/jpeg', quality: 0.82 },
    ])
    expect(result.contentType).toBe('image/jpeg')
    expect(result.blob.type).toBe('image/jpeg')
    expect({ width: result.width, height: result.height }).toEqual({ width: 900, height: 1200 })
  })

  it('test_paints_a_white_page_first_so_transparent_pixels_do_not_turn_black_in_jpeg', async () => {
    const optimizer = setup({ writesWebp: false })

    await optimizer.optimize(new Blob(['photo'], { type: 'image/png' }))

    expect(canvas.context.fillRect).toHaveBeenCalledWith(0, 0, 1600, 1200)
    expect(canvas.context.fillStyle).toBe('white')
  })

  it('test_releases_the_decoded_bitmap_and_the_canvas_memory', async () => {
    const optimizer = setup()

    await optimizer.optimize(new Blob(['photo'], { type: 'image/jpeg' }))

    expect(bitmap.close).toHaveBeenCalled()
    expect({ width: canvas.width, height: canvas.height }).toEqual({ width: 0, height: 0 })
  })

  it('test_a_file_the_browser_cannot_decode_is_reported_as_unreadable', async () => {
    const optimizer = setup()
    decode.mockRejectedValueOnce(new DOMException('bad image', 'InvalidStateError'))

    await expect(optimizer.optimize(new Blob(['not an image']))).rejects.toBeInstanceOf(
      ImageUnreadableError
    )
  })
})
