import { StorageUnavailable } from '#exceptions/errors'
import {
  ObjectStorage,
  type PresignPutOptions,
  type PresignedPut,
  type StoredObjectInfo,
} from '#services/storage/object_storage'

/**
 * Bound when no S3-compatible disk is configured (`DRIVE_DISK` is not `s3`):
 * every call answers 503 `E_STORAGE_UNAVAILABLE`, so the app boots and
 * works without a bucket and only direct uploads are off.
 */
export class DisabledObjectStorage extends ObjectStorage {
  async presignPut(_key: string, _options: PresignPutOptions): Promise<PresignedPut> {
    throw new StorageUnavailable()
  }

  async head(_key: string): Promise<StoredObjectInfo | null> {
    throw new StorageUnavailable()
  }

  async getBytes(_key: string, _maxBytes: number): Promise<Buffer> {
    throw new StorageUnavailable()
  }

  async delete(_key: string): Promise<void> {
    throw new StorageUnavailable()
  }
}
