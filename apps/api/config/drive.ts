import env from '#start/env'
import app from '@adonisjs/core/services/app'
import { defineConfig, services } from '@adonisjs/drive'

/**
 * File storage. Production keeps files in Cloudflare R2 (S3 API) and local
 * development in MinIO (`DRIVE_DISK=s3`): the API container has no volume.
 * `fs` exists for tests (`drive.fake()`) and offline tinkering only.
 *
 * Empty `DRIVE_DISK` = nothing is persisted: bank CSVs are parsed in memory
 * and not archived (see `isDriveEnabled`).
 */
const driveConfig = defineConfig({
  default: env.get('DRIVE_DISK') ?? 'fs',

  services: {
    fs: services.fs({
      location: app.makePath('storage'),
      serveFiles: false,
      visibility: 'private',
    }),
    s3: services.s3({
      credentials: {
        accessKeyId: env.get('S3_KEY')?.release() ?? '',
        secretAccessKey: env.get('S3_SECRET')?.release() ?? '',
      },
      region: env.get('S3_REGION') ?? 'auto',
      bucket: env.get('S3_BUCKET') ?? '',
      endpoint: env.get('S3_ENDPOINT'),
      forcePathStyle: env.get('S3_FORCE_PATH_STYLE') ?? false,
      supportsACL: false,
      visibility: 'private',
    }),
  },
})

/** True when a disk is configured (`DRIVE_DISK` set): uploads get archived. */
export function isDriveEnabled() {
  return Boolean(env.get('DRIVE_DISK'))
}

export default driveConfig

declare module '@adonisjs/drive/types' {
  export interface DriveDisks extends InferDriveDisks<typeof driveConfig> {}
}
