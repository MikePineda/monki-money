import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TAXONOMY, taxonomyName } from './taxonomy.ts'
import { CATEGORY_GROUP_KINDS } from './enums.ts'

const allCategorySlugs = TAXONOMY.flatMap((group) => group.categories.map((c) => c.slug))
const allGroupSlugs = TAXONOMY.map((group) => group.slug)

test('every slug is unique across groups and categories', () => {
  const slugs = [...allGroupSlugs, ...allCategorySlugs]
  assert.equal(new Set(slugs).size, slugs.length)
})

test('slugs are stable kebab-case identifiers', () => {
  for (const slug of [...allGroupSlugs, ...allCategorySlugs]) {
    assert.match(slug, /^[a-z]+(-[a-z]+)*$/, slug)
  }
})

test('the taxonomy contains the slugs the importer and the rules rely on', () => {
  for (const slug of [
    'rent',
    'utilities',
    'phone-internet',
    'home-goods',
    'groceries',
    'public-transport',
    'gym',
    'subscriptions-games',
    'shared-outings',
    'bank-fees',
    'taxes',
    'donations',
    'misc',
    'salary',
    'reimbursements',
    'refunds',
    'cash-income',
    'other-income',
  ]) {
    assert.ok(allCategorySlugs.includes(slug), slug)
  }
  assert.ok(allGroupSlugs.includes('finance-other'))
})

test('there is no transfer or uncategorized category (transfers are not categories, NULL is uncategorized)', () => {
  for (const slug of allCategorySlugs) {
    assert.ok(!['transfer', 'transfers', 'uncategorized', 'uncategorised'].includes(slug), slug)
  }
})

test('only the income group is of kind income', () => {
  for (const group of TAXONOMY) {
    assert.ok(CATEGORY_GROUP_KINDS.includes(group.kind))
    assert.equal(group.kind === 'income', group.slug === 'income', group.slug)
  }
})

test('every group and category has a non-empty name in both languages', () => {
  for (const group of TAXONOMY) {
    assert.ok(group.nameEn.trim() && group.nameEs.trim(), group.slug)
    for (const category of group.categories) {
      assert.ok(category.nameEn.trim() && category.nameEs.trim(), category.slug)
    }
  }
})

test('taxonomyName picks the name for the locale', () => {
  const food = TAXONOMY.find((g) => g.slug === 'food')!
  const groceries = food.categories.find((c) => c.slug === 'groceries')!
  assert.equal(taxonomyName(groceries, 'en'), groceries.nameEn)
  assert.equal(taxonomyName(groceries, 'es'), groceries.nameEs)
  assert.equal(taxonomyName(food, 'es'), food.nameEs)
})
