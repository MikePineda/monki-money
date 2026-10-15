import { type RuleMatch, findMatchingRule } from '#domain/importing/rule_matching'
import type { CategorySuggester } from '#domain/importing/suggesters/category_suggester'
import type { MerchantRule, Suggestion, SuggestionInput } from '#domain/importing/types'

const CONFIDENCE: Readonly<Record<RuleMatch['level'], number>> = {
  merchant_full: 1,
  merchant_base: 0.95,
  pattern: 0.9,
}

/**
 * First link: the household's own rules (learned or typed), by precedence
 * full merchant key -> base merchant key -> contains/regex by priority. // gitleaks:allow
 * Trusted (no review). A winning rule that only names a transfer account
 * has no category opinion.
 */
export class RuleSuggester implements CategorySuggester {
  constructor(private readonly rules: readonly MerchantRule[]) {}

  async suggest(rows: readonly SuggestionInput[]): Promise<Array<Suggestion | null>> {
    return rows.map((row) => {
      const match = findMatchingRule(this.rules, row)
      if (!match || match.rule.categoryId === null) return null
      return {
        source: 'rule',
        categoryId: match.rule.categoryId,
        confidence: CONFIDENCE[match.level],
        needsReview: false,
        ruleId: match.rule.id,
        payee: match.rule.payeeOverride,
        paidByUserId: match.rule.paidByUserId,
      }
    })
  }
}
