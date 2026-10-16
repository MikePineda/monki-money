import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import { FieldError } from '#exceptions/field_error'
import { CsvTooLargeError } from '#importers/errors'
import { MAX_CSV_BYTES } from '#importers/bank_csv_parser'
import ImportService from '#services/imports/import_service'
import { privacyViewer } from '#services/ledger/privacy_viewer'
import { readUploadIntoMemory } from '#services/http/multipart_upload'
import ImportBatchTransformer from '#transformers/import_batch_transformer'
import ImportBatchDetailTransformer from '#transformers/import_batch_detail_transformer'
import {
  confirmImportValidator,
  importParamsValidator,
  listImportsValidator,
  showImportValidator,
  uploadImportValidator,
} from '#validators/imports'

/** Bank imports of the current household (any member): upload, review, confirm. */
@inject()
export default class ImportsController {
  constructor(protected imports: ImportService) {}

  /** GET /imports: batches, newest first (`{ data, metadata }`, `?status=`). */
  async index(ctx: HttpContext) {
    const filters = await ctx.request.validateUsing(listImportsValidator)

    const page = await this.imports.list(ctx.household, filters)

    return ctx.serialize(ImportBatchTransformer.paginate(page.all(), page.getMeta()))
  }

  /**
   * POST /imports (multipart `file`, at most 2 MB, read in memory; optional
   * `accountId`): 201 with one staged batch per account of the file.
   */
  async store(ctx: HttpContext) {
    const upload = await readUploadIntoMemory(ctx.request, 'file', {
      maxBytes: MAX_CSV_BYTES,
      tooLarge: () => new CsvTooLargeError(),
    })
    const fields = await ctx.request.validateUsing(uploadImportValidator)
    if (!upload) throw new FieldError('file', 'required')

    const batches = await this.imports.stage(ctx.household, ctx.auth.getUserOrFail(), {
      buffer: upload.buffer,
      fileName: upload.fileName,
      accountId: fields.accountId,
    })

    ctx.response.status(201)
    return ctx.serialize(ImportBatchTransformer.transform(batches))
  }

  /**
   * GET /imports/:id: the batch with its rows (`?resolution=` filters them);
   * `?rows=0` answers the batch alone (classify polling, the result screen).
   */
  async show(ctx: HttpContext) {
    const {
      params,
      resolution,
      rows: withRows,
    } = await ctx.request.validateUsing(showImportValidator)

    const batch = await this.imports.find(ctx.household, params.id)
    if (withRows === false) return ctx.serialize(ImportBatchTransformer.transform(batch))

    const viewer = await privacyViewer(ctx.household, ctx.auth.getUserOrFail())
    const rows = await this.imports.rows(batch, { resolution })

    return ctx.serialize(ImportBatchDetailTransformer.transform(batch, rows, viewer))
  }

  /** POST /imports/:id/classify: 202; the model suggests categories for uncertain rows. */
  async classify(ctx: HttpContext) {
    const { params } = await ctx.request.validateUsing(importParamsValidator)

    const batch = await this.imports.classify(ctx.household, ctx.auth.getUserOrFail(), params.id)

    ctx.response.status(202)
    return ctx.serialize(ImportBatchTransformer.transform(batch))
  }

  /**
   * POST /imports/:id/confirm (`{ decisions? }`): one DB transaction;
   * `{ created, matched, ignored, transfers, reconciliation }`.
   */
  async confirm(ctx: HttpContext) {
    const { params, decisions } = await ctx.request.validateUsing(confirmImportValidator)

    const result = await this.imports.confirm(
      ctx.household,
      ctx.auth.getUserOrFail(),
      params.id,
      { decisions },
      'all'
    )

    return { data: result }
  }

  /** POST /imports/:id/cancel: the rows still waiting are dropped. */
  async cancel(ctx: HttpContext) {
    const { params } = await ctx.request.validateUsing(importParamsValidator)

    const batch = await this.imports.cancel(ctx.household, params.id)

    return ctx.serialize(ImportBatchTransformer.transform(batch))
  }
}
