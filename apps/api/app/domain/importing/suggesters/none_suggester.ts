import type { CategorySuggester } from '#domain/importing/suggesters/category_suggester'
import type { Suggestion, SuggestionInput } from '#domain/importing/types'

/** Last link: no category (NULL = uncategorized), always under review. */
export class NoneSuggester implements CategorySuggester {
  async suggest(rows: readonly SuggestionInput[]): Promise<Suggestion[]> {
    return rows.map(() => ({
      source: 'none',
      categoryId: null,
      confidence: 0,
      needsReview: true,
      ruleId: null,
      payee: null,
      paidByUserId: null,
    }))
  }
}
