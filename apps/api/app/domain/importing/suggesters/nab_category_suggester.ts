import type { CategorySuggester } from '#domain/importing/suggesters/category_suggester'
import type { Suggestion, SuggestionInput } from '#domain/importing/types'

/** What a bank category means for us (see `app/importers/nab/category_map.ts`). */
export type BankCategoryMapping =
  { kind: 'category'; slug: string; needsReview: boolean } | { kind: 'transfer' }

export const NAB_MAP_CONFIDENCE = { trusted: 0.6, review: 0.3 } as const

/**
 * Second link: the bank's own `Category` column through the NAB -> slug
 * map (injected, so the domain does not depend on a bank). Vague NAB
 * categories still suggest a slug but keep the row under review; transfers
 * and slugs the household no longer has get no opinion.
 */
export class NabCategorySuggester implements CategorySuggester {
  constructor(
    private readonly lookup: (bankCategory: string | null) => BankCategoryMapping | null,
    private readonly categoryIdBySlug: ReadonlyMap<string, number>
  ) {}

  async suggest(rows: readonly SuggestionInput[]): Promise<Array<Suggestion | null>> {
    return rows.map((row) => {
      const mapping = this.lookup(row.nabCategory)
      if (!mapping || mapping.kind !== 'category') return null
      const categoryId = this.categoryIdBySlug.get(mapping.slug)
      if (categoryId === undefined) return null
      return {
        source: 'nab_map',
        categoryId,
        confidence: mapping.needsReview ? NAB_MAP_CONFIDENCE.review : NAB_MAP_CONFIDENCE.trusted,
        needsReview: mapping.needsReview,
        ruleId: null,
        payee: null,
        paidByUserId: null,
      }
    })
  }
}
