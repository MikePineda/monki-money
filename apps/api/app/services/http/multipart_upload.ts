import type { HttpRequest } from '@adonisjs/core/http'
import type { MultipartStream } from '@adonisjs/core/types/bodyparser'

export interface InMemoryUpload {
  buffer: Buffer
  fileName: string
}

/**
 * Reads one multipart file field into memory, for routes listed in
 * `bodyparser.multipart.processManually` (no temporary file ever touches
 * the stateless container). Past `maxBytes` the upload is aborted with
 * `tooLarge()` before the rest is buffered. The other form fields are
 * available through `request.all()` afterwards. Null when the request has
 * no such file (or is not multipart at all).
 */
export async function readUploadIntoMemory(
  request: HttpRequest,
  field: string,
  options: { maxBytes: number; tooLarge: () => Error }
): Promise<InMemoryUpload | null> {
  if (!request.is(['multipart/form-data'])) return null

  const multipart = request.multipart
  let upload: InMemoryUpload | null = null

  multipart.onFile(field, {}, async (part: MultipartStream) => {
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of part as AsyncIterable<Buffer>) {
      size += chunk.length
      if (size > options.maxBytes) {
        multipart.abort(options.tooLarge())
        return
      }
      chunks.push(chunk)
    }
    upload = { buffer: Buffer.concat(chunks), fileName: part.filename }
  })

  await multipart.process()
  return upload
}
