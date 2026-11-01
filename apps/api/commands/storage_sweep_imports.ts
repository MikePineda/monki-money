import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'

/**
 * `node ace storage:sweep-imports [--dry-run] [--force]`: deletes the
 * archived bank exports (`imports/{householdId}/{batchId}.csv`) whose import
 * batch no longer exists. Deleting an account already deletes its CSVs;
 * this catches what a storage outage left behind, a household purge, and
 * anything older than that cleanup. A dry run by default: it lists the
 * orphans and the counts, and only `--force` deletes them. Keys under the
 * prefix that are not archived CSVs are reported, never touched. Needs a
 * disk (`DRIVE_DISK`).
 */
export default class StorageSweepImports extends BaseCommand {
  static override commandName = 'storage:sweep-imports'
  static override description =
    'Delete archived bank CSVs whose import batch is gone (dry run unless --force)'
  static override options: CommandOptions = { startApp: true }

  @flags.boolean({ description: 'List what would be deleted without deleting it (the default)' })
  declare dryRun?: boolean

  @flags.boolean({ description: 'Delete the orphaned CSVs' })
  declare force?: boolean

  override async run() {
    // App code is imported lazily, after the app (and its providers) booted.
    const { isDriveEnabled } = await import('#config/drive')
    const { default: ImportArchiveSweeper } =
      await import('#services/imports/import_archive_sweeper')

    if (!isDriveEnabled()) {
      this.logger.error('No storage configured: set DRIVE_DISK and the S3_* variables')
      this.exitCode = 1
      return
    }
    if (this.force && this.dryRun) {
      this.logger.error('--force and --dry-run exclude each other')
      this.exitCode = 1
      return
    }

    const dryRun = !this.force
    const sweeper = await this.app.container.make(ImportArchiveSweeper)
    const report = await sweeper.sweep({ dryRun })

    for (const key of report.orphaned) this.logger.log(`orphan ${key}`)
    for (const key of report.unrecognised) this.logger.log(`unrecognised ${key} (left alone)`)
    this.logger.info(
      `scanned ${report.scanned}, kept ${report.kept}, orphaned ${report.orphaned.length}, ` +
        `deleted ${report.deleted}, unrecognised ${report.unrecognised.length}`
    )
    if (dryRun) {
      this.logger.info('dry run: nothing was deleted (run again with --force to delete)')
      return
    }
    if (report.deleted < report.orphaned.length) {
      this.logger.warning(
        `${report.orphaned.length - report.deleted} orphan(s) could not be deleted (see the log)`
      )
      this.exitCode = 1
      return
    }
    this.logger.success('sweep done')
  }
}
