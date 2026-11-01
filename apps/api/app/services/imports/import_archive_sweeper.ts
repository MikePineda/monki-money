import { inject } from '@adonisjs/core'
import db from '@adonisjs/lucid/services/db'
import ImportArchive from '#services/imports/import_archive'

/** What a sweep found (and, unless it was a dry run, deleted). */
export interface SweepReport {
  /** Keys under the imports prefix. */
  scanned: number
  /** Archived CSVs whose batch still exists. */
  kept: number
  /** Archived CSVs whose batch is gone (its account or household was deleted). */
  orphaned: string[]
  /** Orphans deleted (0 on a dry run). */
  deleted: number
  /** Keys under the prefix that are not `imports/{householdId}/{batchId}.csv`: never touched. */
  unrecognised: string[]
}

/**
 * Finds the archived bank exports (`imports/{householdId}/{batchId}.csv`)
 * whose import batch no longer exists, e.g. left behind by an account
 * deleted while the bucket was down, or by a household purge, and deletes
 * them unless it is a dry run. A batch row always exists before its CSV is
 * stored, so a sweep never races an upload in flight. Keys it does not
 * recognise are reported and left alone.
 */
@inject()
export default class ImportArchiveSweeper {
  constructor(protected archive: ImportArchive) {}

  async sweep(options: { dryRun: boolean }): Promise<SweepReport> {
    const report: SweepReport = { scanned: 0, kept: 0, orphaned: [], deleted: 0, unrecognised: [] }

    for await (const keys of this.archive.keys()) {
      report.scanned += keys.length
      const archived = new Map<string, { householdId: number; batchId: number }>()
      for (const key of keys) {
        const parsed = ImportArchive.parseKey(key)
        if (parsed) archived.set(key, parsed)
        else report.unrecognised.push(key)
      }

      const live = await this.liveBatches([...archived.values()].map((entry) => entry.batchId))
      const orphans: string[] = []
      for (const [key, { householdId, batchId }] of archived) {
        if (live.get(batchId) === householdId) report.kept++
        else orphans.push(key)
      }
      report.orphaned.push(...orphans)
      if (!options.dryRun) report.deleted += await this.archive.discard(orphans)
    }

    return report
  }

  /** Household of each batch of `ids` that still exists. */
  protected async liveBatches(ids: number[]): Promise<Map<number, number>> {
    if (ids.length === 0) return new Map()
    const rows: Array<{ id: number; household_id: number }> = await db
      .from('import_batches')
      .whereIn('id', ids)
      .select('id', 'household_id')
    return new Map(rows.map((row) => [row.id, row.household_id]))
  }
}
