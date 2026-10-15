import { inject } from '@adonisjs/core'
import ImportRow from '#models/import_row'
import ImportBatch from '#models/import_batch'
import { LlmProvider } from '#llm/llm_provider'
import logger from '@adonisjs/core/services/logger'
import { llmCategoryChoices } from '#services/categories/llm_category_choices'
import { decodeHtmlEntities } from '#importers/html_entities'
import type { ClassifyRows } from '#domain/importing/suggesters/llm_suggester'
import { LlmProviderError, LlmQuotaExceededError } from '#llm/errors'
import { classifyingSuggester } from '#services/imports/suggester_chains'
import ImportContextLoader from '#services/imports/import_context_loader'
import type { Suggestion, SuggestionInput } from '#domain/importing/types'

export interface ClassifyBatchPayload {
  householdId: number
  userId: number | null
  batchId: number
}

/** Rows per model call (the provider's default classify batch). */
export const CHUNK_ROWS = 40

/** Rows one classify run handles; the next run picks up the rest. */
export const MAX_ROWS_PER_RUN = 500

/** A classify claim older than this belongs to a run that died. */
export const CLASSIFY_CLAIM_MINUTES = 10

/**
 * The classify step of an import (`ClassifyImportRowsJob`): rows that will
 * become spending or income and still have no trusted category go through
 * the chain again with the model (rule -> NAB map -> LLM -> none). Only the
 * suggestion columns change, chunk by chunk. The model failing or the
 * quota running out mid-way keeps the chunks already answered and stops
 * (nothing thrown).
 */
@inject()
export default class ImportClassifier {
  constructor(
    protected loader: ImportContextLoader,
    protected llm: LlmProvider
  ) {}

  /**
   * Number of rows whose suggestion changed. Releases the batch's classify
   * claim (`ImportService.classify`) when it ends, whatever happened.
   */
  async classify(payload: ClassifyBatchPayload): Promise<number> {
    try {
      return await this.run(payload)
    } finally {
      await ImportBatch.query()
        .where('household_id', payload.householdId)
        .where('id', payload.batchId)
        .update({ classify_started_at: null })
    }
  }

  /**
   * At most `MAX_ROWS_PER_RUN` rows, `CHUNK_ROWS` per model call, each
   * chunk saved as soon as it is answered: a failure (model down, quota)
   * keeps what was already classified and stops.
   */
  protected async run(payload: ClassifyBatchPayload): Promise<number> {
    const batch = await ImportBatch.query()
      .where('household_id', payload.householdId)
      .where('id', payload.batchId)
      .first()
    if (!batch?.isStaged) return 0

    const candidates = await this.rowsToClassify(batch)
    const rows = candidates.slice(0, MAX_ROWS_PER_RUN)
    if (rows.length === 0) return 0

    const [rules, categoryIdBySlug, categories] = await Promise.all([
      this.loader.rules(payload.householdId),
      this.loader.categoryIdBySlug(payload.householdId),
      llmCategoryChoices(payload.householdId),
    ])
    const classify: ClassifyRows = async (requests) => {
      const result = await this.llm.classifyTransactions(
        {
          rows: requests.map((request) => ({
            id: String(request.index),
            date: request.date,
            amountCents: request.amountCents,
            description: request.description,
            merchant: request.merchant,
            bankCategory: request.nabCategory,
          })),
          categories,
        },
        { householdId: payload.householdId, userId: payload.userId }
      )
      return result.data.suggestions.map((suggestion) => ({
        index: Number(suggestion.id),
        slug: suggestion.categorySlug,
        confidence: suggestion.confidence,
        payee: suggestion.payee,
      }))
    }

    const suggester = classifyingSuggester(rules, categoryIdBySlug, classify)
    let changed = 0
    for (let offset = 0; offset < rows.length; offset += CHUNK_ROWS) {
      const chunk = rows.slice(offset, offset + CHUNK_ROWS)
      let answers: ReadonlyArray<Suggestion | null>
      try {
        answers = await suggester.suggest(chunk.map(suggestionInputOf))
      } catch (error) {
        if (error instanceof LlmQuotaExceededError || error instanceof LlmProviderError) {
          logger.warn(
            { householdId: payload.householdId, batchId: batch.id, code: error.code, changed },
            'import classify stopped: the model is unavailable'
          )
          return changed
        }
        throw error
      }
      changed += await this.save(chunk, answers)
    }
    return changed
  }

  /** Stores the model's answers of one chunk (other links' answers change nothing here). */
  protected async save(rows: ImportRow[], answers: ReadonlyArray<Suggestion | null>) {
    let changed = 0
    for (const [index, row] of rows.entries()) {
      const answer = answers[index]
      if (!answer || answer.source !== 'llm') continue
      row.merge({
        suggestedCategoryId: answer.categoryId,
        suggestionSource: 'llm',
        suggestionConfidence: answer.confidence,
        suggestionNeedsReview: answer.needsReview,
        suggestionRuleId: null,
        suggestedPayee: answer.payee?.slice(0, 120) ?? row.suggestedPayee,
        needsReview: row.isFutureDated || answer.needsReview,
        reasons: answer.needsReview
          ? row.reasons
          : row.reasons.filter((reason) => reason !== 'category_needs_review'),
      })
      await row.save()
      changed++
    }
    return changed
  }

  /**
   * Open rows headed for a new expense/income (not transfers, not matches,
   * not ignored) whose category is missing or under review and that no one
   * categorized by hand.
   */
  protected async rowsToClassify(batch: ImportBatch) {
    const rows = await ImportRow.query()
      .where('import_batch_id', batch.id)
      .whereNull('confirmed_at')
      .whereIn('resolution', ['new', 'needs_confirmation'])
      .whereNull('transfer_signal')
      .whereNull('match_transaction_id')
      .where((query) =>
        query
          .whereNull('suggested_category_id')
          .orWhere('suggestion_needs_review', true)
          .orWhereNull('suggestion_source')
      )
      .orderBy('row_index')
    return rows.filter(
      (row) => !Object.hasOwn(row.decision ?? {}, 'categoryId') && !row.decision?.splits?.length
    )
  }
}

function suggestionInputOf(row: ImportRow): SuggestionInput {
  return {
    date: row.date,
    merchantKey: row.merchantKey,
    merchantFullKey: row.merchantFullKey,
    details: decodeHtmlEntities(row.descriptionRaw),
    descriptionNormalized: row.descriptionNormalized,
    nabCategory: row.nabCategory,
    nabMerchant: row.nabMerchant,
    amountCents: row.amountCents,
  }
}
