import { test } from '@japa/runner'
import { type LearningDecision, learnRules } from '#domain/importing/learning'
import { merchantRule } from '#tests/helpers/importing'

const GROCERIES = 10
const ALCOHOL = 14
const SAVINGS = 2
const PARTNER = 2

function decision(overrides: Partial<LearningDecision> = {}): LearningDecision {
  return {
    action: 'create',
    merchantFullKey: 'freshco market northvale village',
    suggested: {
      categoryId: GROCERIES,
      transferAccountId: null,
      paidByUserId: null,
      fromRule: true,
    },
    final: { categoryId: GROCERIES, transferAccountId: null, paidByUserId: null },
    ...overrides,
  }
}

test.group('Importing / learning', () => {
  test('test_learning_overwrites_previous_rule_for_merchant', ({ assert }) => {
    const existing = merchantRule({ id: 5, categoryId: GROCERIES, paidByUserId: 1 })
    const upserts = learnRules(
      [decision({ final: { categoryId: ALCOHOL, transferAccountId: null, paidByUserId: null } })],
      [existing]
    )
    assert.deepEqual(upserts, [
      {
        matchType: 'merchant',
        pattern: 'freshco market northvale village',
        categoryId: ALCOHOL,
        transferAccountId: null,
        paidByUserId: 1,
        createdBy: 'system',
        existingRuleId: 5,
      },
    ])
  })

  test('test_learning_skips_rows_confirmed_as_their_rule_suggested', ({ assert }) => {
    assert.deepEqual(learnRules([decision()], [merchantRule()]), [])
  })

  test('test_learning_turns_accepted_llm_nab_and_none_suggestions_into_rules', ({ assert }) => {
    const accepted = decision({
      suggested: {
        categoryId: GROCERIES,
        transferAccountId: null,
        paidByUserId: null,
        fromRule: false,
      },
    })
    assert.deepEqual(learnRules([accepted], []), [
      {
        matchType: 'merchant',
        pattern: 'freshco market northvale village',
        categoryId: GROCERIES,
        transferAccountId: null,
        paidByUserId: null,
        createdBy: 'system',
        existingRuleId: null,
      },
    ])
  })

  test('test_learning_learns_transfer_destinations', ({ assert }) => {
    const transfer = decision({
      action: 'transfer',
      merchantFullKey: 'linked acc trns sample househo',
      suggested: { categoryId: null, transferAccountId: null, paidByUserId: null, fromRule: false },
      final: { categoryId: null, transferAccountId: SAVINGS, paidByUserId: null },
    })
    const [upsert] = learnRules([transfer], [])
    assert.include(upsert, { categoryId: null, transferAccountId: SAVINGS })

    const asRuleSaid = decision({
      ...transfer,
      suggested: {
        categoryId: null,
        transferAccountId: SAVINGS,
        paidByUserId: null,
        fromRule: true,
      },
    })
    assert.deepEqual(learnRules([asRuleSaid], []), [])
  })

  test('test_learning_records_the_payer_only_when_the_user_changed_it', ({ assert }) => {
    const changedPayer = decision({
      final: { categoryId: GROCERIES, transferAccountId: null, paidByUserId: PARTNER },
    })
    assert.include(learnRules([changedPayer], [])[0], {
      paidByUserId: PARTNER,
      categoryId: GROCERIES,
    })

    const cardPayer = decision({
      suggested: {
        categoryId: null,
        transferAccountId: null,
        paidByUserId: PARTNER,
        fromRule: false,
      },
      final: { categoryId: GROCERIES, transferAccountId: null, paidByUserId: PARTNER },
    })
    assert.include(learnRules([cardPayer], [])[0], { paidByUserId: null })
  })

  test('test_learning_ignores_matched_ignored_uncategorized_and_opted_out_rows', ({ assert }) => {
    const changed = { final: { categoryId: ALCOHOL, transferAccountId: null, paidByUserId: null } }
    const skipped = [
      decision({ ...changed, action: 'match' }),
      decision({ ...changed, action: 'ignore' }),
      decision({ ...changed, learnRule: false }),
      decision({ ...changed, merchantFullKey: '' }),
      decision({ final: { categoryId: null, transferAccountId: null, paidByUserId: PARTNER } }),
      decision({
        action: 'transfer',
        final: { categoryId: null, transferAccountId: null, paidByUserId: null },
      }),
    ]
    assert.deepEqual(learnRules(skipped, []), [])
  })

  test('test_learning_keeps_the_last_decision_for_a_merchant_in_the_batch', ({ assert }) => {
    const upserts = learnRules(
      [
        decision({ final: { categoryId: ALCOHOL, transferAccountId: null, paidByUserId: null } }),
        decision({ final: { categoryId: 99, transferAccountId: null, paidByUserId: null } }),
      ],
      []
    )
    assert.lengthOf(upserts, 1)
    assert.equal(upserts[0].categoryId, 99)
  })
})
