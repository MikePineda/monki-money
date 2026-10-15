import type { MerchantRule, StagedRow } from '#domain/importing/types'

export type RuleSubject = Pick<
  StagedRow,
  'merchantKey' | 'merchantFullKey' | 'details' | 'nabMerchant'
>

export interface RuleMatch {
  rule: MerchantRule
  level: 'merchant_full' | 'merchant_base' | 'pattern'
}

/** Pattern rules only look at this much text (bank details are short; bounds regex work). */
const MAX_SUBJECT_LENGTH = 500

const compiledPatterns = new WeakMap<MerchantRule, RegExp | null>()

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * `contains` matches whole words, case-insensitively (`ABC` never matches
 * `FABCO`); `regex` is case-insensitive and an invalid one never matches.
 */
function patternOf(rule: MerchantRule): RegExp | null {
  const cached = compiledPatterns.get(rule)
  if (cached !== undefined) return cached

  let pattern: RegExp | null = null
  const text = rule.pattern.trim()
  if (rule.matchType === 'contains' && text !== '') {
    pattern = new RegExp(`(?<![a-z0-9])${escapeRegExp(text)}(?![a-z0-9])`, 'i')
  } else if (rule.matchType === 'regex' && text !== '') {
    try {
      pattern = new RegExp(text, 'i')
    } catch {
      pattern = null
    }
  }
  compiledPatterns.set(rule, pattern)
  return pattern
}

function patternMatches(rule: MerchantRule, subject: RuleSubject): boolean {
  const pattern = patternOf(rule)
  if (!pattern) return false
  return [subject.details, subject.nabMerchant ?? ''].some((text) =>
    pattern.test(text.slice(0, MAX_SUBJECT_LENGTH))
  )
}

/**
 * The one rule that applies to a row, by precedence: a `merchant` rule on
 * the full merchant key, then on the base key, then `contains` / `regex`
 * rules by priority (highest first, then oldest). Category suggestions and
 * transfer detection both read this single winner.
 */
export function findMatchingRule(
  rules: readonly MerchantRule[],
  subject: RuleSubject
): RuleMatch | null {
  const merchantRule = (key: string) =>
    key === ''
      ? undefined
      : rules.find((rule) => rule.matchType === 'merchant' && rule.pattern === key)

  const full = merchantRule(subject.merchantFullKey)
  if (full) return { rule: full, level: 'merchant_full' }
  const base = merchantRule(subject.merchantKey)
  if (base) return { rule: base, level: 'merchant_base' }

  const pattern = rules
    .filter((rule) => rule.matchType !== 'merchant')
    .sort((a, b) => b.priority - a.priority || a.id - b.id)
    .find((rule) => patternMatches(rule, subject))
  return pattern ? { rule: pattern, level: 'pattern' } : null
}
