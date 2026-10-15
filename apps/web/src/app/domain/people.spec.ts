import { firstName, initial } from './people'

describe('people', () => {
  it('test_first_name_is_the_first_word_of_the_full_name', () => {
    expect(firstName('Sam Rivera')).toBe('Sam')
    expect(firstName('  Ana  María López ')).toBe('Ana')
    expect(firstName('')).toBe('')
  })

  it('test_initial_is_the_uppercase_first_letter', () => {
    expect(initial('sam rivera')).toBe('S')
    expect(initial('Émile')).toBe('É')
    expect(initial('')).toBe('?')
  })
})
