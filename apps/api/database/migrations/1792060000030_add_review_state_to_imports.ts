import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Review polish of bank imports (docs/import-pipeline.md):
 *
 * - `import_batches.classify_finished_at`: when the last classify run ended
 *   (also when it failed). A run is going on while `classify_started_at`
 *   holds a claim younger than 10 minutes; the API exposes it as
 *   `classifying`, so the review screen polls only while a run lasts.
 * - `import_rows.proposed_resolution`: the importer's resolution, kept when
 *   a person's decision moves `resolution`, so a bulk "Undo" can put a row
 *   back as the importer proposed it (`reset`). Rows staged before this
 *   migration and still undecided get their current resolution.
 * - Duplicate rows of a re-upload are now stored (`resolution =
 *   'duplicate'`, settled at staging) so the review can list them. Their
 *   hash is the stored row's hash, so the uniqueness of
 *   `(household_id, account_id, external_hash)` now leaves duplicates out:
 *   a partial unique index replaces the constraint. The old version never
 *   writes duplicate rows, so for it nothing changes while both versions
 *   run side by side (the index exists before the constraint goes).
 *
 * Additive otherwise: older app versions never read these columns.
 */
export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('import_batches', (table) => {
      table.timestamp('classify_finished_at', { useTz: true }).nullable()
    })

    this.schema.alterTable('import_rows', (table) => {
      table
        .enum('proposed_resolution', null, {
          useNative: true,
          enumName: 'import_resolution',
          existingType: true,
        })
        .nullable()
    })
    this.schema.raw(
      `UPDATE import_rows SET proposed_resolution = resolution WHERE decided_at IS NULL`
    )

    this.schema.raw(
      `CREATE UNIQUE INDEX import_rows_household_account_hash_kept
         ON import_rows (household_id, account_id, external_hash)
         WHERE resolution <> 'duplicate'`
    )
    this.schema.alterTable('import_rows', (table) => {
      table.dropUnique(
        ['household_id', 'account_id', 'external_hash'],
        'import_rows_household_account_hash_unique'
      )
    })
  }

  async down() {
    this.schema.raw(`DELETE FROM import_rows WHERE resolution = 'duplicate'`)
    this.schema.alterTable('import_rows', (table) => {
      table.unique(['household_id', 'account_id', 'external_hash'], {
        indexName: 'import_rows_household_account_hash_unique',
      })
    })
    this.schema.raw('DROP INDEX IF EXISTS import_rows_household_account_hash_kept')
    this.schema.alterTable('import_rows', (table) => {
      table.dropColumn('proposed_resolution')
    })
    this.schema.alterTable('import_batches', (table) => {
      table.dropColumn('classify_finished_at')
    })
  }
}
