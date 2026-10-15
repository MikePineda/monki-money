import { inject } from '@adonisjs/core'
import { Job } from '@adonisjs/queue'
import type { JobOptions } from '@adonisjs/queue/types'
import ImportClassifier, { type ClassifyBatchPayload } from '#services/imports/import_classifier'

/**
 * Asks the model for the categories of a staged import's rows that are
 * still uncertain (`POST /imports/:id/classify`). Inline with
 * `QUEUE_DRIVER=sync`; a worker later. Never retried: a failed run leaves
 * the rows as staged, and the person can classify again.
 */
@inject()
export default class ClassifyImportRowsJob extends Job<ClassifyBatchPayload> {
  static override options: JobOptions = { name: 'ClassifyImportRowsJob', maxRetries: 0 }

  constructor(protected classifier: ImportClassifier) {
    super()
  }

  async execute() {
    await this.classifier.classify(this.payload)
  }
}
