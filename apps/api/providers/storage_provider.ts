import type { ApplicationService } from '@adonisjs/core/types'
import { ObjectStorage } from '#services/storage/object_storage'

/**
 * Binds the `ObjectStorage` token (an abstract class) to one shared
 * instance: the S3-compatible bucket when `DRIVE_DISK=s3`, the disabled
 * storage otherwise. Services receive it with `@inject()`; tests swap it
 * with `fakeObjectStorage()` (tests/helpers/storage.ts).
 */
export default class StorageProvider {
  constructor(protected app: ApplicationService) {}

  register() {
    this.app.container.singleton(ObjectStorage, async () => {
      // Config and the AWS SDK load lazily, on the first upload.
      const { default: env } = await import('#start/env')
      const { s3Settings } = await import('#config/drive')
      const { createObjectStorage } = await import('#services/storage/create_object_storage')
      return createObjectStorage(env.get('DRIVE_DISK'), s3Settings)
    })
  }
}
