import { crc32, inflateRawSync } from 'node:zlib'
import type { ApiRequest } from '@japa/api-client'

const CENTRAL_HEADER = 0x02014b50
const LOCAL_HEADER = 0x04034b50
const DATA_DESCRIPTOR = 0x08074b50
const END_OF_CENTRAL_DIRECTORY = Buffer.from([0x50, 0x4b, 0x05, 0x06])

/**
 * A minimal, strict ZIP reader for tests: walks the central directory,
 * checks every local header and data descriptor against it, inflates each
 * entry and verifies its CRC-32 and size. Throws on anything off, so a
 * test that reads an archive also proves it is well formed. Returns the
 * entries in archive order as UTF-8 text.
 */
export function unzip(archive: Buffer): Map<string, string> {
  const end = archive.lastIndexOf(END_OF_CENTRAL_DIRECTORY)
  if (end < 0 || end !== archive.length - 22) throw new Error('No end of central directory')
  const count = archive.readUInt16LE(end + 10)
  const directorySize = archive.readUInt32LE(end + 12)
  const directoryOffset = archive.readUInt32LE(end + 16)
  if (directoryOffset + directorySize !== end) throw new Error('Central directory size mismatch')

  const files = new Map<string, string>()
  let cursor = directoryOffset
  for (let index = 0; index < count; index++) {
    if (archive.readUInt32LE(cursor) !== CENTRAL_HEADER) throw new Error('Bad central header')
    const flags = archive.readUInt16LE(cursor + 8)
    const method = archive.readUInt16LE(cursor + 10)
    const crc = archive.readUInt32LE(cursor + 16)
    const compressedSize = archive.readUInt32LE(cursor + 20)
    const size = archive.readUInt32LE(cursor + 24)
    const nameLength = archive.readUInt16LE(cursor + 28)
    const extraLength = archive.readUInt16LE(cursor + 30)
    const commentLength = archive.readUInt16LE(cursor + 32)
    const localOffset = archive.readUInt32LE(cursor + 42)
    const name = archive.toString('utf8', cursor + 46, cursor + 46 + nameLength)

    if (archive.readUInt32LE(localOffset) !== LOCAL_HEADER)
      throw new Error(`Bad local header: ${name}`)
    const localNameLength = archive.readUInt16LE(localOffset + 26)
    const localExtraLength = archive.readUInt16LE(localOffset + 28)
    const localName = archive.toString('utf8', localOffset + 30, localOffset + 30 + localNameLength)
    if (localName !== name) throw new Error(`Local name ${localName} differs from ${name}`)
    const start = localOffset + 30 + localNameLength + localExtraLength
    const data = archive.subarray(start, start + compressedSize)
    if (flags & 0x0008) {
      if (archive.readUInt32LE(start + compressedSize) !== DATA_DESCRIPTOR)
        throw new Error(`Missing data descriptor: ${name}`)
      if (archive.readUInt32LE(start + compressedSize + 4) !== crc)
        throw new Error(`Data descriptor CRC differs: ${name}`)
    }

    const content = method === 8 ? inflateRawSync(data) : data
    if (content.length !== size) throw new Error(`Size mismatch: ${name}`)
    if (crc32(content) !== crc) throw new Error(`CRC mismatch: ${name}`)
    if (files.has(name)) throw new Error(`Duplicate entry: ${name}`)
    files.set(name, content.toString('utf8'))

    cursor += 46 + nameLength + extraLength + commentLength
  }
  return files
}

/** Sends `request` and returns the raw response bytes (a zip download). */
export async function download(request: ApiRequest) {
  // Without a response type, superagent decodes unknown types as UTF-8 text.
  request.request.responseType('blob')
  const response = await request
  return { response, archive: response.body() as Buffer }
}

/** Splits a CSV file (BOM, CRLF records, no embedded newlines) into its lines. */
export function csvLines(text: string): string[] {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n$/, '')
    .split('\r\n')
}
