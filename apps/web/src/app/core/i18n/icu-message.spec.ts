import { formatIcuMessage } from './icu-message'

describe('formatIcuMessage', () => {
  const plural = '{count, plural, =0 {No transactions} one {# transaction} other {# transactions}}'

  it('test_plain_text_is_returned_unchanged', () => {
    expect(formatIcuMessage('Save expense', {}, 'en-AU')).toBe('Save expense')
  })

  it('test_simple_arguments_are_interpolated', () => {
    expect(formatIcuMessage('No transactions in {month} yet.', { month: 'October' }, 'en-AU')).toBe(
      'No transactions in October yet.'
    )
  })

  it('test_a_missing_argument_renders_empty', () => {
    expect(formatIcuMessage('Hi {name}.', {}, 'en-AU')).toBe('Hi .')
  })

  it('test_plural_uses_exact_matches_then_locale_categories', () => {
    expect(formatIcuMessage(plural, { count: 0 }, 'en-AU')).toBe('No transactions')
    expect(formatIcuMessage(plural, { count: 1 }, 'en-AU')).toBe('1 transaction')
    expect(formatIcuMessage(plural, { count: 5 }, 'en-AU')).toBe('5 transactions')
  })

  it('test_hash_is_the_number_formatted_for_the_locale', () => {
    expect(formatIcuMessage(plural, { count: 1284 }, 'en-AU')).toBe('1,284 transactions')
  })

  it('test_spanish_plural_rules_apply', () => {
    const es = '{count, plural, one {# movimiento} other {# movimientos}}'

    expect(formatIcuMessage(es, { count: 1 }, 'es-MX')).toBe('1 movimiento')
    expect(formatIcuMessage(es, { count: 2 }, 'es-MX')).toBe('2 movimientos')
  })

  it('test_plural_falls_back_to_other', () => {
    expect(formatIcuMessage('{n, plural, other {# items}}', { n: 1 }, 'en-AU')).toBe('1 items')
  })

  it('test_plural_offset_shifts_the_number', () => {
    const message =
      '{n, plural, offset:1 =0 {nobody} =1 {you} one {you and # other} other {you and # others}}'

    expect(formatIcuMessage(message, { n: 1 }, 'en-AU')).toBe('you')
    expect(formatIcuMessage(message, { n: 2 }, 'en-AU')).toBe('you and 1 other')
    expect(formatIcuMessage(message, { n: 4 }, 'en-AU')).toBe('you and 3 others')
  })

  it('test_select_picks_the_branch_or_other', () => {
    const message = '{who, select, you {You paid} partner {{name} paid} other {Shared}}'

    expect(formatIcuMessage(message, { who: 'you' }, 'en-AU')).toBe('You paid')
    expect(formatIcuMessage(message, { who: 'partner', name: 'Sam' }, 'en-AU')).toBe('Sam paid')
    expect(formatIcuMessage(message, { who: 'household' }, 'en-AU')).toBe('Shared')
  })

  it('test_selectordinal_uses_ordinal_rules', () => {
    const message = '{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}'

    expect(formatIcuMessage(message, { n: 1 }, 'en-AU')).toBe('1st')
    expect(formatIcuMessage(message, { n: 22 }, 'en-AU')).toBe('22nd')
    expect(formatIcuMessage(message, { n: 13 }, 'en-AU')).toBe('13th')
  })

  it('test_number_argument_is_formatted', () => {
    expect(formatIcuMessage('{n, number} rows', { n: 375000 }, 'es-MX')).toBe('375,000 rows')
  })

  it('test_nested_arguments_inside_branches', () => {
    const message = '{count, plural, one {# row in {file}} other {# rows in {file}}}'

    expect(formatIcuMessage(message, { count: 3, file: 'nab.csv' }, 'en-AU')).toBe(
      '3 rows in nab.csv'
    )
  })

  it('test_apostrophes_are_literal_unless_they_quote_syntax', () => {
    expect(formatIcuMessage("your bank's CSV", {}, 'en-AU')).toBe("your bank's CSV")
    expect(formatIcuMessage("It''s here", {}, 'en-AU')).toBe("It's here")
    expect(formatIcuMessage("Use '{braces}' literally", {}, 'en-AU')).toBe('Use {braces} literally')
  })

  it('test_hash_outside_plural_is_literal', () => {
    expect(formatIcuMessage('Row #3', {}, 'en-AU')).toBe('Row #3')
  })

  it('test_malformed_messages_are_returned_as_is', () => {
    expect(formatIcuMessage('Broken {count, plural, one {x}', { count: 1 }, 'en-AU')).toBe(
      'Broken {count, plural, one {x}'
    )
  })
})
