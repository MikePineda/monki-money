import { aRule } from '../../../testing/import-fixtures'
import {
  EMPTY_RULE_DRAFT,
  RULE_PATTERN_MAX_LENGTH,
  RULE_PRIORITY_LIMIT,
  draftFromRule,
  formatPriority,
  isPatternLocked,
  ruleErrorsFrom,
  ruleInput,
  rulePatch,
  ruleProblems,
  stepPriority,
  type RuleDraft,
} from './rule-draft'

function aDraft(changes: Partial<RuleDraft> = {}): RuleDraft {
  return { ...EMPTY_RULE_DRAFT, pattern: 'corner grocer', categoryId: 20, ...changes }
}

describe('rule draft', () => {
  it('test_a_new_rule_requires_a_category_or_a_transfer_account', () => {
    expect(ruleProblems(aDraft({ categoryId: null }))).toEqual({ target: 'required' })
    expect(
      ruleProblems(aDraft({ target: 'transfer', categoryId: 20, transferAccountId: null }))
    ).toEqual({ target: 'required' })
    expect(ruleProblems(aDraft({ target: 'transfer', transferAccountId: 2 }))).toEqual({})
  })

  it('test_a_rule_needs_a_pattern_no_longer_than_the_api_allows', () => {
    expect(ruleProblems(aDraft({ pattern: '   ' }))).toEqual({ pattern: 'required' })
    expect(ruleProblems(aDraft({ pattern: 'x'.repeat(RULE_PATTERN_MAX_LENGTH) }))).toEqual({})
    expect(ruleProblems(aDraft({ pattern: 'x'.repeat(RULE_PATTERN_MAX_LENGTH + 1) }))).toEqual({
      pattern: 'tooLong',
    })
    expect(ruleProblems(aDraft({ payeeOverride: 'x'.repeat(121) }))).toEqual({ payee: 'tooLong' })
  })

  it('test_the_body_sets_exactly_one_target_and_trims_the_text', () => {
    expect(
      ruleInput(
        aDraft({
          matchType: 'contains',
          pattern: '  FRESHCO ',
          target: 'transfer',
          categoryId: 20,
          transferAccountId: 2,
          payeeOverride: '  ',
        })
      )
    ).toEqual({
      matchType: 'contains',
      pattern: 'FRESHCO',
      categoryId: null,
      transferAccountId: 2,
      paidByUserId: null,
      payeeOverride: null,
      priority: 0,
    })
    expect(ruleInput(aDraft({ transferAccountId: 2, payeeOverride: ' FreshCo ' }))).toMatchObject({
      categoryId: 20,
      transferAccountId: null,
      payeeOverride: 'FreshCo',
    })
  })

  it('test_an_edit_sends_only_what_changed', () => {
    const rule = aRule({ id: 1, pattern: 'corner grocer', categoryId: 20, priority: 0 })
    const draft = draftFromRule(rule)

    expect(rulePatch(rule, draft)).toEqual({})
    expect(rulePatch(rule, { ...draft, categoryId: 10, priority: 2 })).toEqual({
      categoryId: 10,
      priority: 2,
    })
    expect(rulePatch(rule, { ...draft, target: 'transfer', transferAccountId: 2 })).toEqual({
      categoryId: null,
      transferAccountId: 2,
    })
  })

  it('test_a_bank_default_never_sends_its_match_type_or_pattern', () => {
    const rule = aRule({
      id: 9,
      origin: 'system',
      matchType: 'contains',
      pattern: 'Linked Acc Trns',
      categoryId: null,
      transferAccountId: 2,
    })

    expect(isPatternLocked(rule)).toBe(true)
    expect(isPatternLocked(aRule({ origin: 'learned' }))).toBe(false)
    expect(isPatternLocked(null)).toBe(false)
    expect(
      rulePatch(rule, {
        ...draftFromRule(rule),
        matchType: 'regex',
        pattern: 'anything',
        paidByUserId: 1,
      })
    ).toEqual({ paidByUserId: 1 })
  })

  it('test_an_existing_rule_fills_the_draft', () => {
    expect(
      draftFromRule(
        aRule({
          matchType: 'regex',
          pattern: '^Hnry\\b',
          categoryId: null,
          transferAccountId: 3,
          paidByUserId: 2,
          payeeOverride: 'Hnry',
          priority: -4,
        })
      )
    ).toEqual({
      matchType: 'regex',
      pattern: '^Hnry\\b',
      target: 'transfer',
      categoryId: null,
      transferAccountId: 3,
      paidByUserId: 2,
      payeeOverride: 'Hnry',
      priority: -4,
    })
  })

  it('test_api_field_errors_land_on_the_form_field_they_belong_to', () => {
    expect(
      ruleErrorsFrom({
        pattern: 'This is not a valid regular expression',
        categoryId: 'Choose a category or a transfer account',
        paidByUserId: 'The selected payer does not exist',
        payeeOverride: 'Too long',
        priority: 'Too high',
        matchType: 'Invalid',
        somethingElse: 'Unexpected',
      })
    ).toEqual({
      pattern: 'This is not a valid regular expression',
      target: 'Choose a category or a transfer account',
      paidBy: 'The selected payer does not exist',
      payee: 'Too long',
      priority: 'Too high',
      matchType: 'Invalid',
      form: 'Unexpected',
    })
    expect(ruleErrorsFrom({ transferAccountId: 'Unknown account' })).toEqual({
      target: 'Unknown account',
    })
  })

  it('test_priority_steps_by_one_within_the_api_limits_and_reads_with_a_true_minus', () => {
    expect(stepPriority(0, 1)).toBe(1)
    expect(stepPriority(0, -1)).toBe(-1)
    expect(stepPriority(RULE_PRIORITY_LIMIT, 1)).toBe(RULE_PRIORITY_LIMIT)
    expect(stepPriority(-RULE_PRIORITY_LIMIT, -1)).toBe(-RULE_PRIORITY_LIMIT)
    expect(formatPriority(-3)).toBe('−3')
    expect(formatPriority(5)).toBe('5')
  })
})
