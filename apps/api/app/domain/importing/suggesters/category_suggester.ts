import type { StagedRow, Suggestion, SuggestionInput } from '#domain/importing/types'

/**
 * One link of the category suggestion chain. Batch-shaped so the LLM link
 * can classify many rows per call; answers come back in input order, null
 * where the link has no opinion.
 */
export interface CategorySuggester {
  suggest(rows: readonly SuggestionInput[]): Promise<ReadonlyArray<Suggestion | null>>
}

/** The part of a staged row suggesters may look at. */
export function suggestionInputFor(row: StagedRow): SuggestionInput {
  return {
    merchantKey: row.merchantKey,
    merchantFullKey: row.merchantFullKey,
    details: row.details,
    descriptionNormalized: row.descriptionNormalized,
    nabCategory: row.nabCategory,
    nabMerchant: row.nabMerchant,
    amountCents: row.amountCents,
  }
}

function improves(candidate: Suggestion | null, current: Suggestion | null): boolean {
  if (candidate === null) return false
  if (current === null) return true
  return !candidate.needsReview || candidate.confidence > current.confidence
}

/**
 * Chain of responsibility: `RuleSuggester -> NabCategorySuggester ->
 * LlmSuggester -> NoneSuggester` (the import service picks the links; the
 * LLM one only runs in the classify job). A trusted suggestion (no review
 * needed) settles the row; a tentative one is kept but later links still
 * see the row and replace it when they are trusted or more confident.
 */
export class CategorySuggesterChain implements CategorySuggester {
  constructor(private readonly links: readonly CategorySuggester[]) {}

  async suggest(rows: readonly SuggestionInput[]): Promise<Array<Suggestion | null>> {
    const best: Array<Suggestion | null> = rows.map(() => null)

    for (const link of this.links) {
      const open = best.flatMap((current, index) =>
        current === null || current.needsReview ? [index] : []
      )
      if (open.length === 0) break

      const answers = await link.suggest(open.map((index) => rows[index]))
      open.forEach((rowIndex, position) => {
        const answer = answers[position] ?? null
        if (improves(answer, best[rowIndex])) best[rowIndex] = answer
      })
    }
    return best
  }
}
