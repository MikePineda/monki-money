import { inject } from '@adonisjs/core'
import Category from '#models/category'
import ImportRow from '#models/import_row'
import { TAXONOMY } from '@monkimoney/shared'
import ImportBatch from '#models/import_batch'
import { LlmProvider } from '#llm/llm_provider'
import type { LlmCategoryOption } from '#llm/types'
import logger from '@adonisjs/core/services/logger'
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

/** English names of the shared taxonomy, by slug (what the model reads). */
const TAXONOMY_NAMES = new Map(
  TAXONOMY.flatMap((group) =>
    group.categories.map((category) => [category.slug, { name: category.nameEn, group }] as const)
  )
)

/**
 * The classify step of an import (`ClassifyImportRowsJob`): rows that will
 * become spending or income and still have no trusted category go through
 * the chain again with the model (rule -> NAB map -> LLM -> none). Only the
 * suggestion columns change. The model failing or the quota running out
 * mid-way leaves the rows as they were (no partial writes, nothing thrown).
 */
@inject()
export default class ImportClassifier {
  constructor(
    protected loader: ImportContextLoader,
    protected llm: LlmProvider
  ) {}

  /** Number of rows whose suggestion changed. */
  async classify(payload: ClassifyBatchPayload): Promise<number> {
    const batch = await ImportBatch.query()
      .where('household_id', payload.householdId)
      .where('id', payload.batchId)
      .first()
    if (!batch?.isStaged) return 0

    const rows = await this.rowsToClassify(batch)
    if (rows.length === 0) return 0

    const [rules, categoryIdBySlug, categories] = await Promise.all([
      this.loader.rules(payload.householdId),
      this.loader.categoryIdBySlug(payload.householdId),
      this.categoriesFor(payload.householdId),
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

    let answers: ReadonlyArray<Suggestion | null>
    try {
      answers = await classifyingSuggester(rules, categoryIdBySlug, classify).suggest(
        rows.map(suggestionInputOf)
      )
    } catch (error) {
      if (error instanceof LlmQuotaExceededError || error instanceof LlmProviderError) {
        logger.warn(
          { householdId: payload.householdId, batchId: batch.id, code: error.code },
          'import classify skipped: the model is unavailable'
        )
        return 0
      }
      throw error
    }

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

  /** The household's visible categories as the model sees them (stable slugs). */
  protected async categoriesFor(householdId: number): Promise<LlmCategoryOption[]> {
    const categories = await Category.query()
      .where('household_id', householdId)
      .where('is_hidden', false)
      .preload('group')
      .orderBy('sort_order')
    return categories.map((category) => {
      const known = TAXONOMY_NAMES.get(category.slug)
      return {
        slug: category.slug,
        name: category.isSystem && known ? known.name : category.name,
        group: category.group?.isSystem && known ? known.group.nameEn : category.group?.name,
        kind: category.group?.kind,
      }
    })
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
