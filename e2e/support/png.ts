import { crc32, deflateSync } from 'node:zlib'

/** One PNG chunk: length, type, data and the CRC of type + data. */
function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/**
 * A small synthetic "receipt": a white RGB image with grey text-like bars,
 * encoded as a real PNG so the browser can decode it and the API can read
 * it. Nothing real: the fake model answers with its fixture whatever the
 * pixels say.
 */
export function receiptPng(width = 120, height = 200): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 2 // colour type: RGB
  header[10] = 0 // compression
  header[11] = 0 // filter
  header[12] = 0 // no interlace

  const stride = width * 3 + 1
  const pixels = Buffer.alloc(stride * height, 255)
  for (let y = 0; y < height; y += 1) {
    pixels[y * stride] = 0 // filter: none
    const isLine = y % 12 >= 4 && y % 12 < 7
    if (!isLine) {
      continue
    }
    const lineEnd = 12 + ((y * 37) % (width - 24))
    for (let x = 12; x < lineEnd; x += 1) {
      pixels.fill(90, y * stride + 1 + x * 3, y * stride + 4 + x * 3)
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
