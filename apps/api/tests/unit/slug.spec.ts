import { test } from '@japa/runner'
import { slugify, uniqueSlug } from '#domain/text/slug'

test.group('Slugs', () => {
  test('test_slugify_strips_accents_symbols_and_case', ({ assert }) => {
    assert.equal(slugify('Café & Té'), 'cafe-te')
    assert.equal(slugify('  Hot   Pot!! '), 'hot-pot')
    assert.equal(slugify('Niños'), 'ninos')
  })

  test('test_slugify_never_returns_an_empty_slug', ({ assert }) => {
    assert.equal(slugify('!!!'), 'item')
    assert.equal(slugify('🍕'), 'item')
  })

  test('test_slugify_caps_the_length', ({ assert }) => {
    assert.isAtMost(slugify('a'.repeat(200)).length, 60)
  })

  test('test_unique_slug_appends_the_first_free_counter', ({ assert }) => {
    assert.equal(uniqueSlug('groceries', new Set()), 'groceries')
    assert.equal(uniqueSlug('groceries', new Set(['groceries'])), 'groceries-2')
    assert.equal(uniqueSlug('groceries', new Set(['groceries', 'groceries-2'])), 'groceries-3')
  })
})
