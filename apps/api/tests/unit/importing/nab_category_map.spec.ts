import { test } from '@japa/runner'
import { TAXONOMY } from '@monkimoney/shared'
import { NAB_CATEGORY_MAP, mapNabCategory } from '#importers/nab/category_map'
import { NAB_SYSTEM_RULES, resolveSystemRules } from '#importers/nab/system_rules'

const TAXONOMY_SLUGS = new Set(TAXONOMY.flatMap((group) => group.categories.map((c) => c.slug)))

test.group('Importing / NAB category map', () => {
  test('test_nab_category_map_marks_uncategorised_for_review', ({ assert }) => {
    assert.deepEqual(mapNabCategory('Uncategorised'), {
      kind: 'category',
      slug: 'misc',
      needsReview: true,
    })
    const review = [
      ['Other income', 'other-income'],
      ['Refund', 'refunds'],
      ['Other shopping', 'home-goods'],
      ['Services', 'misc'],
      ['Transfers in', 'reimbursements'],
      ['Transfers out', 'shared-outings'],
    ]
    for (const [nabCategory, slug] of review) {
      assert.deepEqual(mapNabCategory(nabCategory), { kind: 'category', slug, needsReview: true })
    }
  })

  test('test_nab_category_map_trusts_the_specific_categories', ({ assert }) => {
    const trusted = [
      ['Groceries', 'groceries'],
      ['Mortgage & rent', 'rent'],
      ['Phone & internet', 'phone-internet'],
      ['Gym & fitness', 'gym'],
      ['Public transport', 'public-transport'],
      ['Restaurants & takeaway', 'restaurants-takeaway'],
      ['Clothing & accessories', 'clothing'],
      ['Electronics & technology', 'electronics'],
      ['Income', 'salary'],
    ]
    for (const [nabCategory, slug] of trusted) {
      assert.deepEqual(mapNabCategory(nabCategory), { kind: 'category', slug, needsReview: false })
    }
  })

  test('test_nab_category_map_only_uses_taxonomy_slugs', ({ assert }) => {
    for (const [nabCategory, mapping] of Object.entries(NAB_CATEGORY_MAP)) {
      if (mapping.kind === 'category') {
        assert.isTrue(TAXONOMY_SLUGS.has(mapping.slug), `${nabCategory} -> ${mapping.slug}`)
      }
    }
  })

  test('test_internal_transfers_map_to_a_transfer_not_a_category', ({ assert }) => {
    assert.deepEqual(mapNabCategory('Internal transfers'), { kind: 'transfer' })
  })

  test('test_lookup_ignores_case_spacing_and_unknown_names', ({ assert }) => {
    assert.deepEqual(mapNabCategory('  public   TRANSPORT '), mapNabCategory('Public transport'))
    assert.isNull(mapNabCategory('Something NAB adds next year'))
    assert.isNull(mapNabCategory(null))
    assert.isNull(mapNabCategory(''))
  })
})

test.group('Importing / NAB system rules', () => {
  test('test_system_rules_only_point_at_taxonomy_slugs', ({ assert }) => {
    for (const rule of NAB_SYSTEM_RULES) {
      if (rule.categorySlug !== undefined) {
        assert.isTrue(TAXONOMY_SLUGS.has(rule.categorySlug), rule.pattern)
      } else {
        assert.isDefined(rule.transferTo, rule.pattern)
      }
    }
  })

  test('test_system_rules_resolve_targets_and_skip_what_the_household_lacks', ({ assert }) => {
    const categoryIdBySlug = new Map([
      ['public-transport', 11],
      ['rent', 12],
    ])
    const seeds = resolveSystemRules(NAB_SYSTEM_RULES, {
      categoryIdBySlug,
      accounts: [
        { id: 1, institution: 'NAB', kind: 'transaction' },
        { id: 3, institution: 'Hnry', kind: 'wallet' },
      ],
    })
    const byPattern = new Map(seeds.map((seed) => [seed.pattern, seed]))

    assert.include(byPattern.get('TRANSLINK'), { matchType: 'contains', categoryId: 11 })
    assert.include(byPattern.get('DEFT'), { categoryId: 12, transferAccountId: null })
    assert.include(byPattern.get('^Hnry\\b'), { matchType: 'regex', transferAccountId: 3 })
    // No NAB savings account in this household, no salary category: both skipped.
    assert.isFalse(byPattern.has('Linked Acc Trns'))
    assert.isFalse(byPattern.has('PAYROLL'))
    for (const seed of seeds) {
      assert.equal(seed.createdBy, 'system')
    }
  })

  test('test_system_rule_is_skipped_when_two_accounts_fit_its_target', ({ assert }) => {
    const seeds = resolveSystemRules(NAB_SYSTEM_RULES, {
      categoryIdBySlug: new Map(),
      accounts: [
        { id: 2, institution: 'nab', kind: 'savings' },
        { id: 4, institution: 'NAB', kind: 'savings' },
      ],
    })
    assert.deepEqual(seeds, [])
  })
})
