import { DOCUMENT } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { ImageOptimizer, ImageUnreadableError } from './image-optimizer'
import { OBJECT_URLS } from './object-urls'

/** An `<img>` that loads (or fails) as soon as it gets a source, like a browser decoding a blob. */
class FakeImage {
  naturalWidth: number
  naturalHeight: number
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  private source = ''

  constructor(
    private readonly loads: boolean,
    size: { width: number; height: number }
  ) {
    this.naturalWidth = size.width
    this.naturalHeight = size.height
  }

  get src(): string {
    return this.source
  }

  set src(value: string) {
    this.source = value
    queueMicrotask(() => (this.loads ? this.onload?.() : this.onerror?.()))
  }
}

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
  let image: FakeImage
  let urls: { create: ReturnType<typeof vi.fn>; revoke: ReturnType<typeof vi.fn> }

  function setup(
    options: { writesWebp?: boolean; width?: number; height?: number; imgLoads?: boolean } = {}
  ) {
    const size = { width: options.width ?? 4032, height: options.height ?? 3024 }
    canvas = new FakeCanvas(options.writesWebp ?? true)
    bitmap = { ...size, close: vi.fn() }
    image = new FakeImage(options.imgLoads ?? true, size)
    decode = vi.fn(() => Promise.resolve(bitmap))
    urls = { create: vi.fn(() => 'blob:photo-1'), revoke: vi.fn() }
    vi.stubGlobal('createImageBitmap', decode)
    const elements: Record<string, unknown> = { canvas, img: image }
    TestBed.configureTestingModule({
      providers: [
        { provide: DOCUMENT, useValue: { createElement: (tag: string) => elements[tag] ?? null } },
        { provide: OBJECT_URLS, useValue: urls },
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

  it('test_a_heic_photo_falls_back_to_the_img_decoder', async () => {
    // Safari opens HEIC in an <img> although createImageBitmap refuses it.
    const optimizer = setup({ width: 3024, height: 4032 })
    decode.mockRejectedValueOnce(new DOMException('unsupported', 'InvalidStateError'))
    const photo = new Blob(['heic'], { type: 'image/heic' })

    const result = await optimizer.optimize(photo)

    expect(urls.create).toHaveBeenCalledWith(photo)
    expect(image.src).toBe('blob:photo-1')
    expect(canvas.context.drawImage).toHaveBeenCalledWith(image, 0, 0, 1200, 1600)
    expect(result.contentType).toBe('image/webp')
    expect({ width: result.width, height: result.height }).toEqual({ width: 1200, height: 1600 })
    // The blob URL lives only while the photo is drawn.
    expect(urls.revoke).toHaveBeenCalledWith('blob:photo-1')
  })

  it('test_a_browser_without_create_image_bitmap_uses_the_img_decoder', async () => {
    const optimizer = setup()
    vi.stubGlobal('createImageBitmap', undefined)

    const result = await optimizer.optimize(new Blob(['photo'], { type: 'image/jpeg' }))

    expect(canvas.context.drawImage).toHaveBeenCalledWith(image, 0, 0, 1600, 1200)
    expect(result.contentType).toBe('image/webp')
  })

  it('test_a_file_neither_decoder_can_open_is_reported_as_unreadable', async () => {
    const optimizer = setup({ imgLoads: false })
    decode.mockRejectedValueOnce(new DOMException('bad image', 'InvalidStateError'))

    await expect(optimizer.optimize(new Blob(['not an image']))).rejects.toBeInstanceOf(
      ImageUnreadableError
    )
    expect(urls.revoke).toHaveBeenCalledWith('blob:photo-1')
    expect(canvas.context.drawImage).not.toHaveBeenCalled()
  })

  it('test_an_img_that_loads_without_pixels_is_unreadable', async () => {
    const optimizer = setup({ width: 0, height: 0 })
    decode.mockRejectedValueOnce(new DOMException('bad image', 'InvalidStateError'))

    await expect(optimizer.optimize(new Blob(['empty']))).rejects.toBeInstanceOf(
      ImageUnreadableError
    )
    expect(urls.revoke).toHaveBeenCalledWith('blob:photo-1')
  })
})
