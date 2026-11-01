import { isDriveEnabled } from '#config/drive'
import drive from '@adonisjs/drive/services/main'
import logger from '@adonisjs/core/services/logger'

/** Where every archived bank export lives: `imports/{householdId}/{batchId}.csv`. */
export const IMPORTS_PREFIX = 'imports/'

const ARCHIVED_KEY = /^imports\/(\d+)\/(\d+)\.csv$/

/**
 * Keeps the original bank export in the private bucket
 * (`imports/{householdId}/{batchId}.csv`) for audit and re-parsing. Only
 * when a disk is configured (`DRIVE_DISK`); best effort: a storage outage
 * never blocks an import (the batch just has no `file_path`), nor the
 * deletion of what owns the file (the object stays behind for
 * `node ace storage:sweep-imports`).
 */
export default class ImportArchive {
  static keyFor(householdId: number, batchId: number) {
    return `${IMPORTS_PREFIX}${householdId}/${batchId}.csv`
  }

  /** The household and batch an archived key belongs to, or null for any other key. */
  static parseKey(key: string): { householdId: number; batchId: number } | null {
    const match = ARCHIVED_KEY.exec(key)
    if (!match) return null
    return { householdId: Number(match[1]), batchId: Number(match[2]) }
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

  /**
   * Deletes archived files (the `file_path` of batches that are gone or
   * going). Best effort: a key that cannot be deleted is logged and left
   * for the sweep. Returns how many were deleted.
   */
  async discard(keys: readonly string[]): Promise<number> {
    if (!isDriveEnabled()) return 0
    let deleted = 0
    for (const key of keys) {
      try {
        await drive.use().delete(key)
        deleted++
      } catch (error) {
        logger.warn({ err: error, key }, 'import: could not delete an archived CSV')
      }
    }
    return deleted
  }

  /**
   * Deletes every archived file of a household, for the purge that deletes
   * the household itself (its batches go by FK cascade, so their keys are
   * not readable afterwards). Best effort, like `discard`.
   */
  async discardHousehold(householdId: number): Promise<void> {
    if (!isDriveEnabled()) return
    try {
      await drive.use().deleteAll(`${IMPORTS_PREFIX}${householdId}/`)
    } catch (error) {
      logger.warn({ err: error, householdId }, 'import: could not delete the archived CSVs')
    }
  }

  /** Every key under the imports prefix, page by page (the bucket paginates). */
  async *keys(): AsyncGenerator<string[]> {
    let paginationToken: string | undefined
    do {
      const page = await drive.use().listAll(IMPORTS_PREFIX, { recursive: true, paginationToken })
      const keys: string[] = []
      for (const object of page.objects) {
        if (object.isFile) keys.push(object.key)
      }
      yield keys
      paginationToken = page.paginationToken
    } while (paginationToken)
  }
}
