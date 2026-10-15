import type { CategorySuggester } from '#domain/importing/suggesters/category_suggester'
import type { Suggestion, SuggestionInput } from '#domain/importing/types'

/**
 * What the LLM sees of one row: no account numbers or balances. Maps 1:1 to
 * `ClassifyRow` of `app/llm/types.ts` (`id: String(index)`, `bankCategory:
 * nabCategory`).
 */
export interface LlmClassificationRequest {
  /** Position inside this call's batch. */
  index: number
  date: string
  amountCents: number
  description: string
  merchant: string | null
  nabCategory: string | null
}

/** Maps from `ClassifySuggestion` (`index: Number(id)`, `slug: categorySlug`). */
export interface LlmClassification {
  index: number
  /** A taxonomy slug from the list given to the model, or null when unsure. */
  slug: string | null
  /** 0..1 */
  confidence: number
  /** Clean merchant name, when the model could tell. */
  payee?: string | null
}

/**
 * Adapter over `LlmProvider.classifyTransactions`, injected by the import
 * service. The provider already degrades an invalid answer to "no
 * suggestion"; let errors that must abort the classify run (quota) throw.
 */
export type ClassifyRows = (rows: LlmClassificationRequest[]) => Promise<LlmClassification[]>

export interface LlmSuggesterOptions {
  batchSize: number
  /** At or above: trusted; below: suggested but kept under review. */
  minConfidence: number
}

const DEFAULTS: LlmSuggesterOptions = { batchSize: 50, minConfidence: 0.8 }

/**
 * Third link: asks the model, in batches of at most 50 rows. Only slugs
 * the household has are accepted (a slug outside the list, injected or
 * hallucinated, is ignored); confidence is clamped to 0..1.
 */
export class LlmSuggester implements CategorySuggester {
  private readonly options: LlmSuggesterOptions

  constructor(
    private readonly classify: ClassifyRows,
    private readonly categoryIdBySlug: ReadonlyMap<string, number>,
    options: Partial<LlmSuggesterOptions> = {}
  ) {
    this.options = { ...DEFAULTS, ...options }
  }

  async suggest(rows: readonly SuggestionInput[]): Promise<Array<Suggestion | null>> {
    const suggestions: Array<Suggestion | null> = rows.map(() => null)

    for (let offset = 0; offset < rows.length; offset += this.options.batchSize) {
      const batch = rows.slice(offset, offset + this.options.batchSize)
      const answers = await this.classify(
        batch.map((row, index) => ({
          index,
          date: row.date,
          amountCents: row.amountCents,
          description: row.descriptionNormalized,
          merchant: row.nabMerchant,
          nabCategory: row.nabCategory,
        }))
      )

      for (const answer of answers) {
        if (!Number.isInteger(answer.index) || answer.index < 0 || answer.index >= batch.length) {
          continue
        }
        const categoryId = answer.slug === null ? undefined : this.categoryIdBySlug.get(answer.slug)
        if (categoryId === undefined) continue
        const confidence = Math.min(1, Math.max(0, Number(answer.confidence) || 0))
        suggestions[offset + answer.index] = {
          source: 'llm',
          categoryId,
          confidence,
          needsReview: confidence < this.options.minConfidence,
          ruleId: null,
          payee: answer.payee?.trim() || null,
          paidByUserId: null,
        }
      }
    }
    return suggestions
  }
}
