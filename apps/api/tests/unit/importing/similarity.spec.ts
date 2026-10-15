import { test } from '@japa/runner'
import { jaroWinkler, tokenSimilarity, tokenize } from '#domain/importing/similarity'

test.group('Importing / similarity', () => {
  test('test_jaro_winkler_matches_reference_values', ({ assert }) => {
    assert.closeTo(jaroWinkler('martha', 'marhta'), 0.961, 0.001)
    assert.closeTo(jaroWinkler('dwayne', 'duane'), 0.84, 0.001)
    assert.closeTo(jaroWinkler('dixon', 'dicksonx'), 0.813, 0.001)
    assert.equal(jaroWinkler('kmart', 'kmart'), 1)
    assert.equal(jaroWinkler('', 'kmart'), 0)
    assert.equal(jaroWinkler('abc', 'xyz'), 0)
  })

  test('test_tokenize_drops_case_accents_numbers_and_noise_words', ({ assert }) => {
    assert.deepEqual(tokenize('GROCERMART/8 Maple Café PTY LTD 70000000999'), [
      'grocermart',
      'maple',
      'cafe',
    ])
    assert.deepEqual(tokenize('  '), [])
  })

  test('test_token_similarity_finds_the_payee_inside_the_bank_description', ({ assert }) => {
    assert.equal(tokenSimilarity('GrocerMart', 'GROCERMART/8 SAMPLE ROA NORTHVALE'), 1)
    assert.equal(tokenSimilarity('FreshCo', 'FreshCo Market (Northvale Village) FRESHCO MARKET'), 1)
    assert.isAbove(tokenSimilarity('Fresh Co Market', 'FRESHCO MARKET NORTHVALE'), 0.5)
  })

  test('test_token_similarity_is_zero_for_unrelated_or_empty_text', ({ assert }) => {
    assert.equal(tokenSimilarity('Coles', 'KMART 9999 SAMPLEVILLE'), 0)
    assert.equal(tokenSimilarity('', 'KMART'), 0)
    assert.equal(tokenSimilarity('Kmart', ''), 0)
  })
})
