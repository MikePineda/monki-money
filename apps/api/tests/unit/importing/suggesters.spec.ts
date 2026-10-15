import { test } from '@japa/runner'
import {
  type CategorySuggester,
  CategorySuggesterChain,
  suggestionInputFor,
} from '#domain/importing/suggesters/category_suggester'
import {
  type LlmClassificationRequest,
  LlmSuggester,
} from '#domain/importing/suggesters/llm_suggester'
import { NabCategorySuggester } from '#domain/importing/suggesters/nab_category_suggester'
import { NoneSuggester } from '#domain/importing/suggesters/none_suggester'
import { RuleSuggester } from '#domain/importing/suggesters/rule_suggester'
import type { Suggestion, SuggestionInput } from '#domain/importing/types'
import { mapNabCategory } from '#importers/nab/category_map'
import { merchantRule, stagedRow } from '#tests/helpers/importing'

const CATEGORY_IDS = new Map([
  ['groceries', 10],
  ['misc', 11],
  ['other-income', 12],
  ['entertainment-events', 13],
  ['alcohol', 14],
  ['refunds', 15],
])

const groceryRow = suggestionInputFor(stagedRow())
const nabSuggester = new NabCategorySuggester(mapNabCategory, CATEGORY_IDS)

function input(overrides: Partial<SuggestionInput>): SuggestionInput {
  return { ...groceryRow, ...overrides }
}

function fixed(answer: Suggestion | null): CategorySuggester & { calls: number } {
  return {
    calls: 0,
    async suggest(rows) {
      this.calls++
      return rows.map(() => answer)
    },
  }
}

function suggestion(overrides: Partial<Suggestion>): Suggestion {
  return {
    source: 'llm',
    categoryId: 14,
    confidence: 0.9,
    needsReview: false,
    ruleId: null,
    payee: null,
    paidByUserId: null,
    ...overrides,
  }
}

test.group('Importing / rule suggester', () => {
  test('test_rule_suggester_prefers_full_merchant_key_over_base_key', async ({ assert }) => {
    const full = merchantRule({
      id: 1,
      pattern: 'freshco market northvale village',
      categoryId: 10,
    })
    const base = merchantRule({ id: 2, pattern: 'freshco market', categoryId: 11 })
    const contains = merchantRule({
      id: 3,
      matchType: 'contains',
      pattern: 'FRESHCO',
      categoryId: 12,
      priority: 100,
    })

    const suggest = async (rules: (typeof full)[]) => {
      const [first] = await new RuleSuggester(rules).suggest([groceryRow])
      return first
    }

    assert.deepEqual(await suggest([contains, base, full]), {
      source: 'rule',
      categoryId: 10,
      confidence: 1,
      needsReview: false,
      ruleId: 1,
      payee: null,
      paidByUserId: null,
    })
    const withoutFullKey = await suggest([contains, base])
    assert.equal(withoutFullKey?.categoryId, 11)
    const patternOnly = await suggest([contains])
    assert.equal(patternOnly?.categoryId, 12)
    assert.isNull(await suggest([]))
  })

  test('test_pattern_rules_go_by_priority_and_match_whole_words', async ({ assert }) => {
    const row = input({ merchantKey: '', merchantFullKey: '', details: '100200300 ABC 100200300' })
    const low = merchantRule({ id: 1, matchType: 'contains', pattern: 'abc', categoryId: 1 })
    const high = merchantRule({
      id: 2,
      matchType: 'regex',
      pattern: '^\\d+ ABC',
      categoryId: 2,
      priority: 5,
    })
    const broken = merchantRule({
      id: 3,
      matchType: 'regex',
      pattern: '([',
      categoryId: 3,
      priority: 9,
    })
    const [winner] = await new RuleSuggester([low, high, broken]).suggest([row])
    assert.equal(winner?.ruleId, 2)

    const lookalike = input({ merchantKey: '', merchantFullKey: '', details: 'FABCO TRADING' })
    assert.deepEqual(await new RuleSuggester([low]).suggest([lookalike]), [null])
  })

  test('test_rule_suggester_carries_payee_and_payer_and_skips_transfer_rules', async ({
    assert,
  }) => {
    const rule = merchantRule({ categoryId: 10, payeeOverride: 'FreshCo', paidByUserId: 2 })
    const [found] = await new RuleSuggester([rule]).suggest([groceryRow])
    assert.include(found, { payee: 'FreshCo', paidByUserId: 2 })

    const transferOnly = merchantRule({ categoryId: null, transferAccountId: 9 })
    assert.deepEqual(await new RuleSuggester([transferOnly]).suggest([groceryRow]), [null])
  })

  test('test_refund_takes_the_expense_category_of_its_merchant_rule', async ({ assert }) => {
    const refund = suggestionInputFor(
      stagedRow({
        amountCents: 5490,
        details: 'REFUND-EFTPOS TH* SAMPLE TOURS',
        nabCategory: 'Refund',
        nabMerchant: 'TourHub',
        merchantKey: 'tourhub',
        merchantFullKey: 'tourhub',
      })
    )
    const chain = new CategorySuggesterChain([
      new RuleSuggester([merchantRule({ pattern: 'tourhub', categoryId: 13 })]),
      nabSuggester,
      new NoneSuggester(),
    ])
    const [found] = await chain.suggest([refund])
    assert.include(found, { source: 'rule', categoryId: 13, needsReview: false })
  })
})

test.group('Importing / NAB category suggester', () => {
  test('test_nab_suggester_maps_trusted_and_review_categories', async ({ assert }) => {
    const [groceries, uncategorised, transfer, unknown] = await nabSuggester.suggest([
      input({ nabCategory: 'Groceries' }),
      input({ nabCategory: 'Uncategorised' }),
      input({ nabCategory: 'Internal transfers' }),
      input({ nabCategory: 'Brand new NAB category' }),
    ])
    assert.include(groceries, { source: 'nab_map', categoryId: 10, needsReview: false })
    assert.include(uncategorised, { source: 'nab_map', categoryId: 11, needsReview: true })
    assert.isAbove(groceries!.confidence, uncategorised!.confidence)
    assert.isNull(transfer)
    assert.isNull(unknown)
  })

  test('test_cash_deposit_is_suggested_as_other_income_for_review', async ({ assert }) => {
    const cash = input({
      details: 'CASH',
      nabCategory: 'Other income',
      nabMerchant: null,
      amountCents: 12000,
    })
    const [found] = await nabSuggester.suggest([cash])
    assert.include(found, { categoryId: 12, needsReview: true })
  })

  test('test_nab_suggester_skips_slugs_the_household_deleted', async ({ assert }) => {
    const suggester = new NabCategorySuggester(mapNabCategory, new Map())
    assert.deepEqual(await suggester.suggest([input({ nabCategory: 'Groceries' })]), [null])
  })
})

test.group('Importing / LLM suggester', () => {
  test('test_llm_suggester_classifies_in_batches_of_fifty', async ({ assert }) => {
    const batches: LlmClassificationRequest[][] = []
    const suggester = new LlmSuggester(async (rows) => {
      batches.push(rows)
      return rows.map((row) => ({ index: row.index, slug: 'alcohol', confidence: 0.95 }))
    }, CATEGORY_IDS)

    const rows = Array.from({ length: 120 }, () => groceryRow)
    const suggestions = await suggester.suggest(rows)
    assert.deepEqual(
      batches.map((batch) => batch.length),
      [50, 50, 20]
    )
    assert.lengthOf(suggestions, 120)
    assert.isTrue(suggestions.every((found) => found?.categoryId === 14 && found.source === 'llm'))
    // No account number, balance or raw cells ever reach the model.
    assert.deepEqual(batches[0][0], {
      index: 0,
      date: '2026-09-19',
      amountCents: -4520,
      description: 'FRESHCO MARKET NORTHVALE',
      merchant: 'FreshCo Market (Northvale Village)',
      nabCategory: 'Groceries',
    })
  })

  test('test_llm_suggester_trusts_only_known_slugs_and_high_confidence', async ({ assert }) => {
    const suggester = new LlmSuggester(
      async () => [
        { index: 0, slug: 'alcohol', confidence: 0.79, payee: ' FreshCo ' },
        { index: 1, slug: 'not-a-category', confidence: 0.99 },
        { index: 2, slug: null, confidence: 0.99 },
        { index: 3, slug: 'groceries', confidence: 7 },
        { index: 99, slug: 'groceries', confidence: 0.99 },
      ],
      CATEGORY_IDS
    )
    const [low, unknown, none, clamped, missing] = await suggester.suggest(
      Array.from({ length: 5 }, () => groceryRow)
    )
    assert.include(low, { categoryId: 14, needsReview: true, confidence: 0.79, payee: 'FreshCo' })
    assert.isNull(clamped?.payee)
    assert.isNull(unknown)
    assert.isNull(none)
    assert.include(clamped, { categoryId: 10, confidence: 1, needsReview: false })
    assert.isNull(missing)
  })

  test('test_none_suggester_leaves_the_row_uncategorized_for_review', async ({ assert }) => {
    assert.deepEqual(await new NoneSuggester().suggest([groceryRow]), [
      {
        source: 'none',
        categoryId: null,
        confidence: 0,
        needsReview: true,
        ruleId: null,
        payee: null,
        paidByUserId: null,
      },
    ])
  })
})

test.group('Importing / suggester chain', () => {
  test('test_chain_stops_at_the_first_trusted_suggestion', async ({ assert }) => {
    const rule = fixed(suggestion({ source: 'rule', categoryId: 10, confidence: 1 }))
    const later = fixed(suggestion({ categoryId: 14 }))
    const [found] = await new CategorySuggesterChain([rule, later]).suggest([groceryRow])
    assert.equal(found?.source, 'rule')
    assert.equal(later.calls, 0)
  })

  test('test_chain_lets_a_better_link_replace_a_suggestion_under_review', async ({ assert }) => {
    const nab = fixed(
      suggestion({ source: 'nab_map', categoryId: 11, confidence: 0.3, needsReview: true })
    )
    const chain = (llm: Suggestion | null) =>
      new CategorySuggesterChain([nab, fixed(llm), new NoneSuggester()])

    const [trusted] = await chain(suggestion({ categoryId: 14 })).suggest([groceryRow])
    assert.include(trusted, { source: 'llm', categoryId: 14 })

    const [unsure] = await chain(suggestion({ confidence: 0.6, needsReview: true })).suggest([
      groceryRow,
    ])
    assert.include(unsure, { source: 'llm', confidence: 0.6 })

    const [weaker] = await chain(suggestion({ confidence: 0.2, needsReview: true })).suggest([
      groceryRow,
    ])
    assert.include(weaker, { source: 'nab_map' })

    const [nothing] = await chain(null).suggest([groceryRow])
    assert.include(nothing, { source: 'nab_map' })
  })

  test('test_chain_ends_in_none_when_no_link_knows', async ({ assert }) => {
    const chain = new CategorySuggesterChain([
      new RuleSuggester([]),
      nabSuggester,
      new NoneSuggester(),
    ])
    const [found] = await chain.suggest([input({ nabCategory: null })])
    assert.include(found, { source: 'none', categoryId: null, needsReview: true })
  })
})
