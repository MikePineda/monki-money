import type User from '#models/user'
import { inject } from '@adonisjs/core'
import ImportRow from '#models/import_row'
import { Locator } from '@adonisjs/queue'
import ImportBatch from '#models/import_batch'
import type Household from '#models/household'
import db from '@adonisjs/lucid/services/db'
import { findInHousehold } from '#repositories/scoped'
import { ImportBatchClosed } from '#exceptions/errors'
import type { ImportResolution } from '@monkimoney/shared'
import ImportStager from '#services/imports/import_stager'
import ClassifyImportRowsJob from '#jobs/classify_import_rows_job'
import ImportDecisions from '#services/imports/import_decisions'
import ImportConfirmer from '#services/imports/import_confirmer'
import ImportBookkeeping from '#services/imports/import_bookkeeping'
import EntitlementsService from '#services/entitlements/entitlements_service'
import type {
  ConfirmInput,
  ConfirmMode,
  DecideInput,
  ImportListFilters,
  StageInput,
} from '#services/imports/dto'

/**
 * Bank imports of a household (docs/import-pipeline.md): upload and stage
 * (`ImportStager`), let the model classify the uncertain rows (job), record
 * a person's decisions (`ImportDecisions`), confirm into the ledger
 * (`ImportConfirmer`) or cancel. Batch ids in the path are household-scoped
 * (404).
 */
@inject()
export default class ImportService {
  constructor(
    protected stager: ImportStager,
    protected decisions: ImportDecisions,
    protected confirmer: ImportConfirmer,
    protected bookkeeping: ImportBookkeeping,
    protected entitlements: EntitlementsService
  ) {}

  list(household: Household, filters: ImportListFilters) {
    return ImportBatch.query()
      .withScopes((scopes) => scopes.forHousehold(household))
      .if(filters.status, (query) => query.where('status', filters.status!))
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .paginate(filters.page ?? 1, filters.perPage ?? 25)
  }

  find(household: Household, batchId: number) {
    return findInHousehold(ImportBatch, household, batchId)
  }

  /** Rows of a batch in file order, with the transaction they match preloaded. */
  rows(batch: ImportBatch, filters: { resolution?: ImportResolution } = {}) {
    return ImportRow.query()
      .where('household_id', batch.householdId)
      .where('import_batch_id', batch.id)
      .if(filters.resolution, (query) => query.where('resolution', filters.resolution!))
      .preload('matchTransaction')
      .orderBy('row_index')
  }

  stage(household: Household, actor: User, input: StageInput) {
    return this.stager.stage(household, actor, input)
  }

  decide(household: Household, actor: User, batchId: number, rowId: number, input: DecideInput) {
    return this.decisions.decide(household, actor, batchId, rowId, input)
  }

  /**
   * Classifies the batch's uncertain rows with the model. The monthly AI
   * quota is checked up front (402); the job itself never fails the request
   * (inline with the sync queue, it degrades to "no change").
   */
  async classify(household: Household, actor: User, batchId: number) {
    const batch = await this.find(household, batchId)
    if (!batch.isStaged) throw new ImportBatchClosed()
    await this.entitlements.assertLlmQuota(household)

    // Registered here too: console commands do not autoload app/jobs.
    Locator.register(ClassifyImportRowsJob.options.name!, ClassifyImportRowsJob)
    await ClassifyImportRowsJob.dispatch({
      householdId: household.id,
      userId: actor.id,
      batchId: batch.id,
    })
    await batch.refresh()
    return batch
  }

  confirm(
    household: Household,
    actor: User,
    batchId: number,
    input: ConfirmInput = {},
    mode: ConfirmMode = 'all'
  ) {
    return this.confirmer.confirm(household, actor, batchId, input, mode)
  }

  /** Drops the rows still waiting (confirmed ones keep their hash) and closes the batch. */
  async cancel(household: Household, batchId: number) {
    const batch = await this.find(household, batchId)
    await db.transaction(async (trx) => {
      const locked = await ImportBatch.query({ client: trx })
        .where('id', batch.id)
        .forUpdate()
        .firstOrFail()
      if (!locked.isStaged) throw new ImportBatchClosed()
      await ImportRow.query({ client: trx })
        .where('import_batch_id', batch.id)
        .whereNull('confirmed_at')
        .whereNot('resolution', 'superseded')
        .delete()
      locked.useTransaction(trx)
      locked.status = 'cancelled'
      await this.bookkeeping.refreshCounts(locked, trx)
    })
    return this.find(household, batchId)
  }
}
