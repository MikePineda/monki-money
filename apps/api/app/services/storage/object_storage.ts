/**
 * Direct uploads: the browser PUTs a file straight into the private bucket
 * through a short-lived presigned URL, and the API reads it back by key.
 * Unlike Drive (which only writes what the API already holds), this needs
 * presigned writes and size-capped reads.
 *
 * Container token (an abstract class) bound in providers/storage_provider.ts:
 * `S3ObjectStorage` when `DRIVE_DISK=s3` (R2 in production, MinIO locally),
 * `DisabledObjectStorage` otherwise (503 `E_STORAGE_UNAVAILABLE`). Tests swap
 * in the in-memory fake from tests/helpers/storage.ts.
 */

export interface PresignPutOptions {
  contentType: string
  /** Exact size of the body the client will send; when given it is signed too. */
  byteSize?: number
  expiresInSeconds: number
}

export interface PresignedPut {
  url: string
  /** Headers the client must send with the PUT, verbatim (they are signed). */
  headers: Record<string, string>
}

export interface StoredObjectInfo {
  byteSize: number
  contentType: string | null
}

export abstract class ObjectStorage {
  /** A URL that lets anyone holding it PUT exactly this object until it expires. */
  abstract presignPut(key: string, options: PresignPutOptions): Promise<PresignedPut>

  /** Size and type of an object, or null when it does not exist. */
  abstract head(key: string): Promise<StoredObjectInfo | null>

  /**
   * The whole object in memory. Throws StoredObjectTooLarge past `maxBytes`
   * (before buffering the rest) and StoredObjectMissing when it is gone.
   */
  abstract getBytes(key: string, maxBytes: number): Promise<Buffer>

  /** Removes the object; removing a missing object is not an error. */
  abstract delete(key: string): Promise<void>
}

/** The object is larger than the reader allows. */
export class StoredObjectTooLarge extends Error {
  constructor(readonly maxBytes: number) {
    super(`Stored object is larger than ${maxBytes} bytes`)
  }
}

/** The object does not exist (anymore). */
export class StoredObjectMissing extends Error {
  constructor() {
    super('Stored object not found')
  }
}
