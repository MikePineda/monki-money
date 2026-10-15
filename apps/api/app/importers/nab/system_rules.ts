import type { AccountKind } from '@monkimoney/shared'
import type { MerchantRule } from '#domain/importing/types'

/**
 * Rules every household gets (`merchant_rules.created_by = 'system'`) for
 * merchants and movements NAB exports name the same way for everyone.
 * Targets are symbolic (taxonomy slug, account institution/kind) and get
 * resolved against the household when seeding. Nothing personal lives
 * here: anything specific to one household is learned from its decisions.
 */
export interface SystemRuleDefinition {
  matchType: 'contains' | 'regex'
  pattern: string
  categorySlug?: string
  /** The household account money moves to/from; seeded only when exactly one account fits. */
  transferTo?: { institution: string; kind?: AccountKind }
}

export const NAB_SYSTEM_RULES: readonly SystemRuleDefinition[] = [
  { matchType: 'contains', pattern: 'TRANSLINK', categorySlug: 'public-transport' },
  { matchType: 'contains', pattern: 'TRANSIT SYSTEMS', categorySlug: 'public-transport' },
  { matchType: 'contains', pattern: 'DEFT', categorySlug: 'rent' },
  { matchType: 'contains', pattern: 'FELIX MOBILE', categorySlug: 'phone-internet' },
  { matchType: 'contains', pattern: 'KMART', categorySlug: 'home-goods' },
  { matchType: 'contains', pattern: 'PAYROLL', categorySlug: 'salary' },
  // Hnry pays invoices out of the freelancer's Hnry account: `Hnry - INV-...`.
  { matchType: 'regex', pattern: '^Hnry\\b', transferTo: { institution: 'Hnry' } },
  // NAB's own memo for a transfer to a linked NAB account.
  {
    matchType: 'contains',
    pattern: 'Linked Acc Trns',
    transferTo: { institution: 'NAB', kind: 'savings' },
  },
]

export interface SystemRuleTargets {
  categoryIdBySlug: ReadonlyMap<string, number>
  accounts: readonly { id: number; institution: string; kind: AccountKind }[]
}

/** A `merchant_rules` row to insert for a household (no id yet). */
export type SystemRuleSeed = Omit<MerchantRule, 'id'>

function transferAccountId(
  target: NonNullable<SystemRuleDefinition['transferTo']>,
  accounts: SystemRuleTargets['accounts']
): number | null {
  const fits = accounts.filter(
    (account) =>
      account.institution.trim().toLowerCase() === target.institution.toLowerCase() &&
      (target.kind === undefined || account.kind === target.kind)
  )
  return fits.length === 1 ? fits[0].id : null
}

/**
 * Definitions -> rows for one household. A definition whose category or
 * account the household lacks (or whose account is ambiguous) is skipped.
 */
export function resolveSystemRules(
  definitions: readonly SystemRuleDefinition[],
  targets: SystemRuleTargets
): SystemRuleSeed[] {
  return definitions.flatMap((definition) => {
    const categoryId =
      definition.categorySlug === undefined
        ? null
        : (targets.categoryIdBySlug.get(definition.categorySlug) ?? null)
    const transferId =
      definition.transferTo === undefined
        ? null
        : transferAccountId(definition.transferTo, targets.accounts)
    if (categoryId === null && transferId === null) return []

    return [
      {
        matchType: definition.matchType,
        pattern: definition.pattern,
        categoryId,
        transferAccountId: transferId,
        paidByUserId: null,
        payeeOverride: null,
        priority: 0,
        createdBy: 'system' as const,
      },
    ]
  })
}
