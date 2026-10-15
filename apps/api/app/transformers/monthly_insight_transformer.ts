import type MonthlyInsight from '#models/monthly_insight'
import { BaseTransformer } from '@adonisjs/core/transformers'
import { isoTimestamp } from '#domain/time/iso_timestamp'

/** The LLM-written summary of a month, in one language. */
export default class MonthlyInsightTransformer extends BaseTransformer<MonthlyInsight> {
  constructor(
    resource: MonthlyInsight,
    protected fresh = false
  ) {
    super(resource)
  }

  toObject() {
    const insight = this.resource
    return {
      month: insight.month,
      locale: insight.locale,
      headline: insight.headline,
      bodyMarkdown: insight.bodyMarkdown,
      highlights: insight.highlights,
      model: insight.model,
      generatedAt: isoTimestamp(insight.generatedAt)!,
    }
  }

  /** After `POST /generate`: `fresh` = written now (201), not the stored one (200). */
  toGenerated() {
    return { ...this.toObject(), fresh: this.fresh }
  }
}
