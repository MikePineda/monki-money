import { test } from '@japa/runner'
import { findMatchingRule } from '#domain/importing/rule_matching'
import { isSafeRulePattern, MAX_RULE_PATTERN_LENGTH } from '#domain/importing/regex_safety'
import { merchantRule } from '#tests/helpers/importing'

const subject = {
  merchantKey: 'aaaa',
  merchantFullKey: 'aaaa',
  details: 'V1111 30/09 AAAA SAMPLEVILLE 70000000930',
  nabMerchant: null,
}

test.group('Importing / rule matching safety', () => {
  test('test_patterns_that_can_backtrack_catastrophically_are_unsafe', ({ assert }) => {
    for (const pattern of [
      '([a-z0-9 ]+)+#',
      '(a+)+',
      '(a*)*b',
      '(x+x+)+y',
      '(a|aa)+$',
      '(?:ab|a)*c',
      '(a)\\1+b',
      'A'.repeat(MAX_RULE_PATTERN_LENGTH + 1),
    ]) {
      assert.isFalse(isSafeRulePattern(pattern), pattern.slice(0, 20))
    }
  })

  test('test_ordinary_bank_patterns_are_safe', ({ assert }) => {
    for (const pattern of ['^Hnry\\b', '^FIT(BOX|NESS) [A-Z]+$', 'UBER\\s*(EATS)?', '\\d{4}']) {
      assert.isTrue(isSafeRulePattern(pattern), pattern)
    }
  })

  test('test_unsafe_regex_rule_never_matches', ({ assert }) => {
    const rule = merchantRule({ matchType: 'regex', pattern: '(a+)+', categoryId: 1 })
    assert.isNull(findMatchingRule([rule], subject))

    const safe = merchantRule({ matchType: 'regex', pattern: 'A{4} SAMPLE', categoryId: 1 })
    assert.equal(findMatchingRule([safe], subject)?.rule, safe)
  })
})
