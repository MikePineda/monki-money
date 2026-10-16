import type { RuleMatchType } from '@monkimoney/shared'
import type { MerchantRule } from '../../core/api/api-types'
import type { RuleInput } from './data-access/rules.api'

/**
 * The rule form's state and its pure rules: what a person must fill in,
 * the body of a new rule, the changes of an edited one, and where the
 * API's field errors go. No Angular.
 */

/** The API's `MAX_RULE_PATTERN_LENGTH` (apps/api regex_safety.ts). */
export const RULE_PATTERN_MAX_LENGTH = 200
/** The API's limit for `payeeOverride`. */
export const RULE_PAYEE_MAX_LENGTH = 120
/** Priorities go from −1000 to 1000 (API validator). */
export const RULE_PRIORITY_LIMIT = 1000

/** What a matched movement becomes: a category, or a transfer to an account. */
export type RuleTarget = 'category' | 'transfer'

export interface RuleDraft {
  matchType: RuleMatchType
  pattern: string
  target: RuleTarget
  /** Kept while the person looks at the other target; only the chosen one is sent. */
  categoryId: number | null
  transferAccountId: number | null
  /** null = leave the payer as the import decides. */
  paidByUserId: number | null
  payeeOverride: string
  priority: number
}

/** The form's fields, which the API's field names map onto. */
export type RuleField = 'matchType' | 'pattern' | 'target' | 'paidBy' | 'payee' | 'priority'
export type RuleProblem = 'required' | 'tooLong'
export type RuleErrors = Partial<Record<RuleField | 'form', string>>

export const EMPTY_RULE_DRAFT: RuleDraft = {
  matchType: 'merchant',
  pattern: '',
  target: 'category',
  categoryId: null,
  transferAccountId: null,
  paidByUserId: null,
  payeeOverride: '',
  priority: 0,
}

const FIELD_OF_API: Record<string, RuleField> = {
  matchType: 'matchType',
  pattern: 'pattern',
  categoryId: 'target',
  transferAccountId: 'target',
  paidByUserId: 'paidBy',
  payeeOverride: 'payee',
  priority: 'priority',
}

/**
 * Bank defaults (`origin: 'system'`) keep their match type and pattern:
 * the bank's wording is what they recognise, and the defaults are seeded
 * again by (match type, pattern), so a changed pattern would bring the
 * original back next to it. Their target, payer, name and priority change.
 */
export function isPatternLocked(rule: MerchantRule | null): boolean {
  return rule?.origin === 'system'
}

export function draftFromRule(rule: MerchantRule): RuleDraft {
  return {
    matchType: rule.matchType,
    pattern: rule.pattern,
    target: rule.categoryId === null && rule.transferAccountId !== null ? 'transfer' : 'category',
    categoryId: rule.categoryId,
    transferAccountId: rule.transferAccountId,
    paidByUserId: rule.paidByUserId,
    payeeOverride: rule.payeeOverride ?? '',
    priority: rule.priority,
  }
}

/** What stops a save, by field (empty when the draft can go to the API). */
export function ruleProblems(draft: RuleDraft): Partial<Record<RuleField, RuleProblem>> {
  const problems: Partial<Record<RuleField, RuleProblem>> = {}
  const pattern = draft.pattern.trim()
  if (pattern === '') {
    problems.pattern = 'required'
  } else if (pattern.length > RULE_PATTERN_MAX_LENGTH) {
    problems.pattern = 'tooLong'
  }
  if (targetId(draft) === null) {
    problems.target = 'required'
  }
  if (draft.payeeOverride.trim().length > RULE_PAYEE_MAX_LENGTH) {
    problems.payee = 'tooLong'
  }
  return problems
}

/** The `POST /rules` body: exactly one target, trimmed text, null for what is left empty. */
export function ruleInput(draft: RuleDraft): Required<RuleInput> {
  const transfer = draft.target === 'transfer'
  return {
    matchType: draft.matchType,
    pattern: draft.pattern.trim(),
    categoryId: transfer ? null : draft.categoryId,
    transferAccountId: transfer ? draft.transferAccountId : null,
    paidByUserId: draft.paidByUserId,
    payeeOverride: draft.payeeOverride.trim() || null,
    priority: draft.priority,
  }
}

/** The `PATCH /rules/:id` body: only the fields that changed ({} when nothing did). */
export function rulePatch(rule: MerchantRule, draft: RuleDraft): Partial<RuleInput> {
  const next = ruleInput(draft)
  const current: Required<RuleInput> = {
    matchType: rule.matchType,
    pattern: rule.pattern,
    categoryId: rule.categoryId,
    transferAccountId: rule.transferAccountId,
    paidByUserId: rule.paidByUserId,
    payeeOverride: rule.payeeOverride,
    priority: rule.priority,
  }
  const locked = isPatternLocked(rule)
  const patch: Partial<RuleInput> = {}
  for (const key of Object.keys(next) as (keyof RuleInput)[]) {
    if (locked && (key === 'matchType' || key === 'pattern')) {
      continue
    }
    if (next[key] !== current[key]) {
      Object.assign(patch, { [key]: next[key] })
    }
  }
  return patch
}

/** A 422's `{ field: message }` on the form's fields; unknown fields go above the form. */
export function ruleErrorsFrom(fields: Record<string, string>): RuleErrors {
  const errors: RuleErrors = {}
  for (const [field, message] of Object.entries(fields)) {
    const target = FIELD_OF_API[field] ?? 'form'
    errors[target] ??= message
  }
  return errors
}

/** One step up or down, within the API's limits. */
export function stepPriority(priority: number, step: 1 | -1): number {
  return Math.min(RULE_PRIORITY_LIMIT, Math.max(-RULE_PRIORITY_LIMIT, priority + step))
}

/** "3", "0", "−3" (true minus sign). */
export function formatPriority(priority: number): string {
  return priority < 0 ? `−${Math.abs(priority)}` : String(priority)
}

function targetId(draft: RuleDraft): number | null {
  return draft.target === 'transfer' ? draft.transferAccountId : draft.categoryId
}
