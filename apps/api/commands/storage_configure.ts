import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

/**
 * `node ace storage:configure [--dry-run]`: one-off operator setup of the
 * bucket for direct uploads (run once inside the production container, and
 * again whenever APP_URL changes). Idempotent: it reads the bucket's CORS
 * and lifecycle configuration, merges in
 *
 * - a CORS rule letting the APP_URL origin PUT with `Content-Type`
 *   (preflight cached for an hour), and
 * - the `expire-receipts` lifecycle rule (prefix `receipts/`, 1 day),
 *
 * keeps every other rule, writes both back and prints the result (never
 * credentials). Needs `DRIVE_DISK=s3`. Storage without bucket CORS (MinIO)
 * gets the lifecycle rule only.
 */
export default class StorageConfigure extends BaseCommand {
  static override commandName = 'storage:configure'
  static override description =
    'Set the bucket CORS rule for direct uploads and the one-day expiry of receipt photos'
  static override options: CommandOptions = { startApp: true }

  @flags.boolean({ description: 'Print the configuration without applying it' })
  declare dryRun?: boolean

  override async run() {
    // App code is imported lazily, after the app (and its providers) booted.
    const { default: env } = await import('#start/env')
    const { ObjectStorage } = await import('#services/storage/object_storage')
    const { S3ObjectStorage } = await import('#services/storage/s3_object_storage')
    const { BucketConfigurator } = await import('#services/storage/bucket_configurator')

    const storage = await this.app.container.make(ObjectStorage)
    if (!(storage instanceof S3ObjectStorage)) {
      this.logger.error('No bucket configured: set DRIVE_DISK=s3 and the S3_* variables')
      this.exitCode = 1
      return
    }

    const configurator = new BucketConfigurator(storage.client, storage.bucket)
    const plan = await configurator.plan(env.get('APP_URL'))
    this.logger.info(`bucket ${storage.bucket}`)
    this.logger.log(JSON.stringify(plan, null, 2))

    if (this.dryRun) {
      this.logger.info('dry run: nothing was changed')
      return
    }

    const result = await configurator.apply(plan)
    if (!result.corsApplied) {
      this.logger.warning(
        'this storage has no bucket CORS (MinIO allows every origin): only the lifecycle rule was set'
      )
    }
    this.logger.success('bucket configured')
  }
}
