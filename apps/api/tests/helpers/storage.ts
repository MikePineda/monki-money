import app from '@adonisjs/core/services/app'
import {
  ObjectStorage,
  StoredObjectMissing,
  StoredObjectTooLarge,
  type PresignPutOptions,
  type PresignedPut,
  type StoredObjectInfo,
} from '#services/storage/object_storage'

interface StoredObject {
  bytes: Buffer
  contentType: string
}

/**
 * In-memory ObjectStorage (Laravel's `Storage::fake()` for direct uploads).
 * `put()` plays the browser's PUT; `presigned` and `deleted` record what the
 * code asked for; `failDeletes` simulates a storage outage on delete.
 */
export class FakeObjectStorage extends ObjectStorage {
  readonly objects = new Map<string, StoredObject>()
  readonly presigned: Array<{ key: string } & PresignPutOptions> = []
  readonly deleted: string[] = []
  failDeletes = false

  /** What the client's PUT to the presigned URL would store. */
  put(key: string, bytes: Buffer, contentType: string) {
    this.objects.set(key, { bytes, contentType })
    return this
  }

  has(key: string) {
    return this.objects.has(key)
  }

  async presignPut(key: string, options: PresignPutOptions): Promise<PresignedPut> {
    this.presigned.push({ key, ...options })
    const url = new URL(`https://storage.test/fake-bucket/${key}`)
    url.searchParams.set('X-Amz-Expires', String(options.expiresInSeconds))
    url.searchParams.set('X-Amz-Signature', 'fake')
    return { url: url.toString(), headers: { 'Content-Type': options.contentType } }
  }

  async head(key: string): Promise<StoredObjectInfo | null> {
    const object = this.objects.get(key)
    return object ? { byteSize: object.bytes.length, contentType: object.contentType } : null
  }

  async getBytes(key: string, maxBytes: number): Promise<Buffer> {
    const object = this.objects.get(key)
    if (!object) throw new StoredObjectMissing()
    if (object.bytes.length > maxBytes) throw new StoredObjectTooLarge(maxBytes)
    return object.bytes
  }

  async delete(key: string): Promise<void> {
    this.deleted.push(key)
    if (this.failDeletes) throw new Error('storage is down')
    this.objects.delete(key)
  }
}

/** Swaps the container's ObjectStorage for a fresh in-memory fake. */
export function fakeObjectStorage(): FakeObjectStorage {
  const fake = new FakeObjectStorage()
  app.container.swap(ObjectStorage, () => fake)
  return fake
}

/** Back to the configured storage (disabled in tests: `DRIVE_DISK=fs`). */
export function restoreObjectStorage() {
  app.container.restore(ObjectStorage)
}
