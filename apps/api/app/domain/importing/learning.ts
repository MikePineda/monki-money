import type { MerchantRule } from '#domain/importing/types'

interface Targets {
  categoryId: number | null
  transferAccountId: number | null
  paidByUserId: number | null
}

/** One confirmed import row, as the confirm step decided it. */
export interface LearningDecision {
  action: 'create' | 'match' | 'ignore' | 'transfer'
  merchantFullKey: string
  /** What the pipeline proposed; `fromRule` when one of the household's rules proposed it. */
  suggested: Targets & { fromRule: boolean }
  /** What the user confirmed. */
  final: Targets
  /** `false` when the user unticked "remember for next time". */
  learnRule?: boolean
}

/**
 * A `merchant_rules` row to upsert on `(household_id, match_type, pattern)`.
 * `existingRuleId` is set when it overwrites a rule the household already has.
 */
export interface RuleUpsert {
  matchType: 'merchant'
  pattern: string
  categoryId: number | null
  transferAccountId: number | null
  paidByUserId: number | null
  createdBy: 'system'
  existingRuleId: number | null
}

function target(
  decision: LearningDecision
): Pick<Targets, 'categoryId' | 'transferAccountId'> | null {
  if (decision.action === 'create' && decision.final.categoryId !== null) {
    return { categoryId: decision.final.categoryId, transferAccountId: null }
  }
  if (decision.action === 'transfer' && decision.final.transferAccountId !== null) {
    return { categoryId: null, transferAccountId: decision.final.transferAccountId }
  }
  return null
}

/**
 * Which confirmed rows teach the household a rule (pattern = full merchant
 * key): created or transfer rows whose final category / transfer account
 * differs from the suggestion, or whose suggestion did not come from a rule
 * (LLM, NAB map, none), or whose payer the user changed. The payer is only
 * stored when the user changed it (a card holder is not a merchant fact).
 * Matched and ignored rows, uncategorized rows and opt-outs teach nothing;
 * within one batch the last decision for a merchant wins.
 */
export function learnRules(
  decisions: readonly LearningDecision[],
  existingRules: readonly MerchantRule[]
): RuleUpsert[] {
  const upserts = new Map<string, RuleUpsert>()

  for (const decision of decisions) {
    const pattern = decision.merchantFullKey
    const learned = target(decision)
    if (decision.learnRule === false || pattern === '' || learned === null) continue

    const { suggested, final } = decision
    const payerChanged = final.paidByUserId !== suggested.paidByUserId
    const targetChanged =
      learned.categoryId !== suggested.categoryId ||
      learned.transferAccountId !== suggested.transferAccountId
    if (suggested.fromRule && !targetChanged && !payerChanged) continue

    const existing = existingRules.find(
      (rule) => rule.matchType === 'merchant' && rule.pattern === pattern
    )
    upserts.set(pattern, {
      matchType: 'merchant',
      pattern,
      ...learned,
      paidByUserId: payerChanged ? final.paidByUserId : (existing?.paidByUserId ?? null),
      createdBy: 'system',
      existingRuleId: existing?.id ?? null,
    })
  }
  return [...upserts.values()]
}
