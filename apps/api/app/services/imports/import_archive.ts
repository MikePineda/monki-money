import { isDriveEnabled } from '#config/drive'
import drive from '@adonisjs/drive/services/main'
import logger from '@adonisjs/core/services/logger'

/**
 * Keeps the original bank export in the private bucket
 * (`imports/{householdId}/{batchId}.csv`) for audit and re-parsing. Only
 * when a disk is configured (`DRIVE_DISK`); best effort: a storage outage
 * never blocks an import (the batch just has no `file_path`).
 */
export default class ImportArchive {
  static keyFor(householdId: number, batchId: number) {
    return `imports/${householdId}/${batchId}.csv`
  }

  /** The stored key, or null when nothing was stored. */
  async store(householdId: number, batchId: number, csv: Buffer): Promise<string | null> {
    if (!isDriveEnabled()) return null
    const key = ImportArchive.keyFor(householdId, batchId)
    try {
      await drive.use().put(key, csv, { contentType: 'text/csv', visibility: 'private' })
      return key
    } catch (error) {
      logger.warn({ err: error, householdId, batchId }, 'import: could not archive the CSV')
      return null
    }
  }
}
