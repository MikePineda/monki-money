import Clock from '#services/clock'
import { randomUUID } from 'node:crypto'
import { inject } from '@adonisjs/core'
import type Household from '#models/household'
import { receiptKey } from '#domain/receipts/receipt_key'
import { ObjectStorage } from '#services/storage/object_storage'
import type { PresignUploadInput, PresignedUpload } from '#services/uploads/dto'

/** How long a presigned PUT URL works. */
export const UPLOAD_URL_TTL_SECONDS = 5 * 60

/**
 * Direct uploads: hands out a presigned PUT for a key the server picks
 * under the household's prefix, so the photo goes from the browser to the
 * bucket without passing through the API. The signature pins the declared
 * type and size. Nothing is recorded: an object nobody scans is removed by
 * the bucket's one-day lifecycle rule (`node ace storage:configure`).
 */
@inject()
export default class UploadService {
  constructor(
    protected storage: ObjectStorage,
    protected clock: Clock
  ) {}

  async presign(household: Household, input: PresignUploadInput): Promise<PresignedUpload> {
    const now = this.clock.now()
    const key = receiptKey(household.id, randomUUID(), input.contentType)

    const presigned = await this.storage.presignPut(key, {
      contentType: input.contentType,
      byteSize: input.byteSize,
      expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
    })

    return {
      key,
      url: presigned.url,
      headers: presigned.headers,
      expiresAt: now.plus({ seconds: UPLOAD_URL_TTL_SECONDS }).toUTC().toISO()!,
    }
  }
}
