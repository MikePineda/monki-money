import { Injectable, inject } from '@angular/core'
import { API } from '../../../core/api/api'
import type { MonthlyInsight } from '../../../core/api/api-types'
import { hasStatus, toApiError } from '../../../core/api/http-errors'

/** `POST /insights/:month/generate`: `fresh` = written now (201), not the stored one (200). */
export type GeneratedInsight = MonthlyInsight & { fresh: boolean }

/**
 * Data access for the LLM-written monthly summaries. The API answers in the
 * reader's language (the user's locale) and stores one summary per
 * household, month and language.
 */
@Injectable({ providedIn: 'root' })
export class InsightsApi {
  private readonly api = inject(API)

  /** `GET /insights/:month`: the stored summary, or null until one is generated (404). */
  async show(month: string): Promise<MonthlyInsight | null> {
    try {
      const { data } = await (await this.api()).request('insights.show', { params: { month } })
      return data
    } catch (error) {
      if (hasStatus(toApiError(error), 404)) {
        return null
      }
      throw error
    }
  }

  /** Writes the summary (or returns the stored one unless `force`). */
  async generate(month: string, force = false): Promise<GeneratedInsight> {
    const { data } = await (
      await this.api()
    ).request('insights.generate', { params: { month }, body: force ? { force } : {} })
    return data
  }
}
