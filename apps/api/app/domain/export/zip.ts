import { Readable, pipeline } from 'node:stream'
import { createDeflateRaw, crc32 } from 'node:zlib'

/**
 * A streaming ZIP writer (PKWARE APPNOTE 6.3, the subset every unzip tool
 * reads) built on node:zlib, so the export needs no archive dependency.
 * Each entry is deflated as it is read and followed by a data descriptor
 * (sizes and CRC-32 are only known at its end), so memory stays flat
 * whatever the size of the tables: only the central directory (one small
 * record per entry) is held until the end. Names are UTF-8 (flag bit 11).
 * No ZIP64: an entry or archive past 4 GiB throws, far beyond any
 * household's export.
 */

export interface ZipEntry {
  /** Path inside the archive. */
  name: string
  /** The file's bytes, streamed; strings are written as UTF-8. */
  content: AsyncIterable<string | Buffer> | Iterable<string | Buffer>
}

const LOCAL_HEADER = 0x04034b50
const DATA_DESCRIPTOR = 0x08074b50
const CENTRAL_HEADER = 0x02014b50
const END_OF_CENTRAL_DIRECTORY = 0x06054b50

/** Version 2.0: deflate and data descriptors. */
const VERSION = 20
/** Bit 3: sizes and CRC in the data descriptor; bit 11: UTF-8 names. */
const FLAGS = 0x0008 | 0x0800
const DEFLATE = 8
const MAX_UINT32 = 0xffffffff
const MAX_ENTRIES = 0xffff

/** MS-DOS date and time (2-second resolution, years from 1980). */
export function dosDateTime(at: Date) {
  const year = Math.max(at.getUTCFullYear(), 1980)
  return {
    time: (at.getUTCHours() << 11) | (at.getUTCMinutes() << 5) | Math.floor(at.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((at.getUTCMonth() + 1) << 5) | at.getUTCDate(),
  }
}

export async function* zipStream(
  entries: AsyncIterable<ZipEntry> | Iterable<ZipEntry>,
  modifiedAt: Date = new Date()
): AsyncGenerator<Buffer> {
  const { time, date } = dosDateTime(modifiedAt)
  const directory: Buffer[] = []
  let offset = 0

  for await (const entry of entries) {
    if (directory.length === MAX_ENTRIES) throw new Error('Too many ZIP entries')
    const name = Buffer.from(entry.name, 'utf8')
    const header = localHeader(name, time, date)
    yield header

    const measured = { crc: 0, size: 0 }
    let compressedSize = 0
    for await (const chunk of deflated(entry.content, measured)) {
      compressedSize += chunk.length
      yield chunk
    }
    if (measured.size > MAX_UINT32 || compressedSize > MAX_UINT32) {
      throw new Error(`ZIP entry too large: ${entry.name}`)
    }
    yield dataDescriptor(measured.crc, compressedSize, measured.size)

    directory.push(
      centralHeader(name, time, date, measured.crc, compressedSize, measured.size, offset)
    )
    offset += header.length + compressedSize + 16
    if (offset > MAX_UINT32) throw new Error('ZIP archive too large')
  }

  const central = Buffer.concat(directory)
  yield central
  yield endOfCentralDirectory(directory.length, central.length, offset)
}

/**
 * The entry's bytes through a raw deflate stream, counting the CRC-32 and
 * size of what goes in. An error in the content (a failed query) destroys
 * the stream and surfaces here; stopping early (the client went away)
 * destroys it too, which ends the content's generator.
 */
function deflated(
  content: ZipEntry['content'],
  measured: { crc: number; size: number }
): AsyncIterable<Buffer> {
  async function* bytes() {
    for await (const chunk of content) {
      const buffer = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk
      measured.crc = crc32(buffer, measured.crc)
      measured.size += buffer.length
      yield buffer
    }
  }
  const deflate = createDeflateRaw()
  pipeline(Readable.from(bytes()), deflate, () => {})
  return deflate
}

function localHeader(name: Buffer, time: number, date: number) {
  const header = Buffer.alloc(30)
  header.writeUInt32LE(LOCAL_HEADER, 0)
  header.writeUInt16LE(VERSION, 4)
  header.writeUInt16LE(FLAGS, 6)
  header.writeUInt16LE(DEFLATE, 8)
  header.writeUInt16LE(time, 10)
  header.writeUInt16LE(date, 12)
  // CRC-32 and sizes (14-25) stay 0: they follow the data (flag bit 3).
  header.writeUInt16LE(name.length, 26)
  header.writeUInt16LE(0, 28)
  return Buffer.concat([header, name])
}

function dataDescriptor(crc: number, compressedSize: number, size: number) {
  const descriptor = Buffer.alloc(16)
  descriptor.writeUInt32LE(DATA_DESCRIPTOR, 0)
  descriptor.writeUInt32LE(crc, 4)
  descriptor.writeUInt32LE(compressedSize, 8)
  descriptor.writeUInt32LE(size, 12)
  return descriptor
}

function centralHeader(
  name: Buffer,
  time: number,
  date: number,
  crc: number,
  compressedSize: number,
  size: number,
  offset: number
) {
  const header = Buffer.alloc(46)
  header.writeUInt32LE(CENTRAL_HEADER, 0)
  header.writeUInt16LE(VERSION, 4)
  header.writeUInt16LE(VERSION, 6)
  header.writeUInt16LE(FLAGS, 8)
  header.writeUInt16LE(DEFLATE, 10)
  header.writeUInt16LE(time, 12)
  header.writeUInt16LE(date, 14)
  header.writeUInt32LE(crc, 16)
  header.writeUInt32LE(compressedSize, 20)
  header.writeUInt32LE(size, 24)
  header.writeUInt16LE(name.length, 28)
  // Extra field, comment, disk number, internal and external attributes: none.
  header.writeUInt32LE(offset, 42)
  return Buffer.concat([header, name])
}

function endOfCentralDirectory(count: number, size: number, offset: number) {
  const record = Buffer.alloc(22)
  record.writeUInt32LE(END_OF_CENTRAL_DIRECTORY, 0)
  record.writeUInt16LE(count, 8)
  record.writeUInt16LE(count, 10)
  record.writeUInt32LE(size, 12)
  record.writeUInt32LE(offset, 16)
  return record
}
