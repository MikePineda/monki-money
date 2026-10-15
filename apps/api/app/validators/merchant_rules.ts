import vine from '@vinejs/vine'
import { RULE_MATCH_TYPES } from '@monkimoney/shared'
import { id, idParams } from '#validators/rules'
import { MAX_RULE_PATTERN_LENGTH } from '#domain/importing/regex_safety'

/**
 * Merchant rules. Every rule needs a category or a transfer account
 * (checked by RulesService, 422 `categoryId`/`required`); a `regex` pattern
 * must compile (422 `pattern`/`regex`).
 */
const ruleFields = {
  categoryId: id().nullable().optional(),
  transferAccountId: id().nullable().optional(),
  paidByUserId: id().nullable().optional(),
  payeeOverride: vine.string().trim().maxLength(120).nullable().optional(),
  priority: vine.number().withoutDecimals().min(-1000).max(1000).optional(),
}

const pattern = () => vine.string().trim().minLength(1).maxLength(MAX_RULE_PATTERN_LENGTH)

export const createRuleValidator = vine.create({
  matchType: vine.enum(RULE_MATCH_TYPES),
  pattern: pattern(),
  ...ruleFields,
})

export const updateRuleValidator = vine.create({
  params: idParams(),
  matchType: vine.enum(RULE_MATCH_TYPES).optional(),
  pattern: pattern().optional(),
  ...ruleFields,
})

export const ruleParamsValidator = vine.create({
  params: idParams(),
})
