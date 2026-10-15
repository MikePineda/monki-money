import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { StorageUnavailable } from '#exceptions/errors'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import {
  ObjectStorage,
  StoredObjectMissing,
  StoredObjectTooLarge,
  type PresignPutOptions,
  type PresignedPut,
  type StoredObjectInfo,
} from '#services/storage/object_storage'

/** Bucket and credentials (config/drive.ts `s3Settings`, from the S3_* env vars). */
export interface S3Settings {
  credentials: { accessKeyId: string; secretAccessKey: string }
  region: string
  bucket: string
  endpoint?: string
  forcePathStyle: boolean
}

/** The one S3 client of the direct-upload storage (and of `storage:configure`). */
export function createS3Client(settings: S3Settings): S3Client {
  return new S3Client({
    credentials: settings.credentials,
    region: settings.region,
    endpoint: settings.endpoint,
    forcePathStyle: settings.forcePathStyle,
    // Since SDK 3.729 every PutObject carries a CRC32 by default; in a
    // presigned URL that would be the checksum of an empty body, which the
    // bucket then rejects. Checksums only where the API requires them.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })
}

/**
 * ObjectStorage on any S3-compatible bucket (Cloudflare R2, MinIO). Objects
 * stay private: the only way in is a presigned PUT whose `Content-Type` and
 * `Content-Length` are part of the signature, so the client can upload
 * exactly the type and size it declared and nothing else. Failures of the
 * bucket surface as StorageUnavailable (503) with the S3 error as cause.
 */
export class S3ObjectStorage extends ObjectStorage {
  constructor(
    readonly client: S3Client,
    readonly bucket: string
  ) {
    super()
  }

  async presignPut(key: string, options: PresignPutOptions): Promise<PresignedPut> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: options.contentType,
      ContentLength: options.byteSize,
    })
    try {
      const url = await getSignedUrl(this.client, command, {
        expiresIn: options.expiresInSeconds,
        // The presigner leaves Content-Type unsigned by default; sign it.
        signableHeaders: new Set(['content-type']),
      })
      return { url, headers: { 'Content-Type': options.contentType } }
    } catch (error) {
      throw unavailable('presign', error)
    }
  }

  async head(key: string): Promise<StoredObjectInfo | null> {
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }))
      return { byteSize: head.ContentLength ?? 0, contentType: head.ContentType ?? null }
    } catch (error) {
      if (isNotFound(error)) return null
      throw unavailable('head', error)
    }
  }

  async getBytes(key: string, maxBytes: number): Promise<Buffer> {
    let object
    try {
      object = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
    } catch (error) {
      if (isNotFound(error)) throw new StoredObjectMissing()
      throw unavailable('get', error)
    }

    const body = object.Body as (AsyncIterable<Uint8Array> & { destroy?(): void }) | undefined
    if ((object.ContentLength ?? 0) > maxBytes) {
      body?.destroy?.()
      throw new StoredObjectTooLarge(maxBytes)
    }

    const chunks: Buffer[] = []
    let size = 0
    try {
      for await (const chunk of body ?? []) {
        size += chunk.length
        if (size > maxBytes) {
          body?.destroy?.()
          throw new StoredObjectTooLarge(maxBytes)
        }
        chunks.push(Buffer.from(chunk))
      }
    } catch (error) {
      if (error instanceof StoredObjectTooLarge) throw error
      throw unavailable('get', error)
    }
    return Buffer.concat(chunks)
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
    } catch (error) {
      throw unavailable('delete', error)
    }
  }
}

function isNotFound(error: unknown) {
  const failure = error as { name?: string; $metadata?: { httpStatusCode?: number } }
  return (
    failure?.name === 'NotFound' ||
    failure?.name === 'NoSuchKey' ||
    failure?.$metadata?.httpStatusCode === 404
  )
}

/** The S3 error name stays in the message (logs only); clients get the translated 503. */
function unavailable(operation: string, error: unknown) {
  const name = (error as { name?: string })?.name ?? 'Error'
  return new StorageUnavailable(`Object storage ${operation} failed: ${name}`, { cause: error })
}
