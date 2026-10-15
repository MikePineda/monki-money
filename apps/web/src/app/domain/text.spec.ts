import { matchesSearch, normalizeForSearch } from './text'

describe('search text', () => {
  it('test_ignores_case_and_accents', () => {
    expect(normalizeForSearch('Súper  Mercado')).toBe('super mercado')
    expect(matchesSearch('Café y Pan', 'cafe')).toBe(true)
    expect(matchesSearch('Teléfono', 'TELEF')).toBe(true)
  })

  it('test_every_word_of_the_query_must_appear', () => {
    expect(matchesSearch('NAB Everyday', 'nab day')).toBe(true)
    expect(matchesSearch('NAB Savings', 'nab day')).toBe(false)
  })

  it('test_an_empty_query_matches_everything', () => {
    expect(matchesSearch('Anything', '   ')).toBe(true)
  })
})
