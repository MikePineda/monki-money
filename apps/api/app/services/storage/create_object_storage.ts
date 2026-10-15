import type { ObjectStorage } from '#services/storage/object_storage'
import { DisabledObjectStorage } from '#services/storage/disabled_object_storage'
import {
  S3ObjectStorage,
  createS3Client,
  type S3Settings,
} from '#services/storage/s3_object_storage'

/**
 * Strategy selection for the `ObjectStorage` token: the bucket when
 * `DRIVE_DISK=s3` names one, otherwise the disabled storage (503). The `fs`
 * disk cannot presign, so it counts as "no storage" here.
 */
export function createObjectStorage(disk: string | undefined, settings: S3Settings): ObjectStorage {
  if (disk !== 's3' || !settings.bucket) return new DisabledObjectStorage()
  return new S3ObjectStorage(createS3Client(settings), settings.bucket)
}
