import { mapNabCategory } from '#importers/nab/category_map'
import type { MerchantRule } from '#domain/importing/types'
import { RuleSuggester } from '#domain/importing/suggesters/rule_suggester'
import { NoneSuggester } from '#domain/importing/suggesters/none_suggester'
import { type ClassifyRows, LlmSuggester } from '#domain/importing/suggesters/llm_suggester'
import { NabCategorySuggester } from '#domain/importing/suggesters/nab_category_suggester'
import {
  type CategorySuggester,
  CategorySuggesterChain,
} from '#domain/importing/suggesters/category_suggester'

/**
 * The category suggestion chains of docs/import-pipeline.md. Staging runs
 * without the model (< 1 s); the classify job adds it before "none".
 */

/** rule -> NAB map -> none (staging). */
export function stagingSuggester(
  rules: readonly MerchantRule[],
  categoryIdBySlug: ReadonlyMap<string, number>
): CategorySuggester {
  return new CategorySuggesterChain([
    new RuleSuggester(rules),
    new NabCategorySuggester(mapNabCategory, categoryIdBySlug),
    new NoneSuggester(),
  ])
}

/** rule -> NAB map -> LLM -> none (classify job). */
export function classifyingSuggester(
  rules: readonly MerchantRule[],
  categoryIdBySlug: ReadonlyMap<string, number>,
  classify: ClassifyRows
): CategorySuggester {
  return new CategorySuggesterChain([
    new RuleSuggester(rules),
    new NabCategorySuggester(mapNabCategory, categoryIdBySlug),
    new LlmSuggester(classify, categoryIdBySlug),
    new NoneSuggester(),
  ])
}
