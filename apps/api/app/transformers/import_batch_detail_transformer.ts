import type ImportRow from '#models/import_row'
import type { PrivacyViewer } from '#domain/ledger/privacy'
import type ImportBatch from '#models/import_batch'
import { BaseTransformer } from '@adonisjs/core/transformers'
import ImportRowTransformer from '#transformers/import_row_transformer'
import ImportBatchTransformer from '#transformers/import_batch_transformer'

/** `GET /imports/:id`: the batch summary plus its rows in file order. */
export default class ImportBatchDetailTransformer extends BaseTransformer<ImportBatch> {
  constructor(
    resource: ImportBatch,
    protected rows: ImportRow[],
    protected viewer: PrivacyViewer
  ) {
    super(resource)
  }

  toObject() {
    return {
      ...new ImportBatchTransformer(this.resource).toObject(),
      rows: ImportRowTransformer.transform(this.rows, this.viewer),
    }
  }
}
