import {
  MAX_KEYPAD_CENTS,
  applyKeypadKey,
  formatMoney,
  formatMoneyParts,
  formatMoneySpoken,
  formatTransactionAmount,
  parseKeypad,
} from './money'

const MINUS = '−'

describe('formatMoney', () => {
  it('test_dollar_sign_two_decimals_and_thousands_in_both_locales', () => {
    expect(formatMoney(128450, 'en-AU')).toBe('$1,284.50')
    expect(formatMoney(128450, 'es-MX')).toBe('$1,284.50')
  })

  it('test_negative_values_use_the_true_minus_sign', () => {
    const text = formatMoney(-4250, 'en-AU')

    expect(text).toBe(`${MINUS}$42.50`)
    expect(text).not.toContain('-')
  })

  it('test_always_sign_prefixes_plus_on_positive_values', () => {
    expect(formatMoney(320000, 'en-AU', { sign: 'always' })).toBe('+$3,200.00')
    expect(formatMoney(-320000, 'es-MX', { sign: 'always' })).toBe(`${MINUS}$3,200.00`)
  })

  it('test_zero_never_carries_a_sign', () => {
    expect(formatMoney(0, 'en-AU', { sign: 'always' })).toBe('$0.00')
    expect(formatMoney(-0, 'en-AU')).toBe('$0.00')
  })

  it('test_never_sign_shows_the_magnitude_only', () => {
    expect(formatMoney(-4250, 'en-AU', { sign: 'never' })).toBe('$42.50')
  })

  it('test_whole_dollars_round_to_the_nearest_dollar', () => {
    expect(formatMoney(514040, 'en-AU', { wholeDollars: true })).toBe('$5,140')
    expect(formatMoney(514050, 'en-AU', { wholeDollars: true })).toBe('$5,141')
  })

  it('test_cents_are_exact_for_large_amounts', () => {
    expect(formatMoney(99999999, 'en-AU')).toBe('$999,999.99')
  })

  it('test_rejects_fractional_cents', () => {
    expect(() => formatMoney(10.5, 'en-AU')).toThrow(RangeError)
  })
})

describe('formatMoneyParts', () => {
  it('test_splits_the_whole_part_from_the_cents_for_the_hero', () => {
    expect(formatMoneyParts(226340, 'en-AU')).toEqual({
      sign: '',
      whole: '$2,263',
      fraction: '.40',
    })
  })

  it('test_carries_the_minus_sign_separately', () => {
    expect(formatMoneyParts(-4250, 'es-MX')).toEqual({ sign: MINUS, whole: '$42', fraction: '.50' })
  })
})

describe('formatTransactionAmount', () => {
  it('test_expense_is_minus_and_income_is_plus_and_transfer_has_no_sign', () => {
    expect(formatTransactionAmount(8420, 'expense', 'en-AU')).toBe(`${MINUS}$84.20`)
    expect(formatTransactionAmount(320000, 'income', 'en-AU')).toBe('+$3,200.00')
    expect(formatTransactionAmount(50000, 'transfer', 'en-AU')).toBe('$500.00')
  })

  it('test_uses_the_magnitude_whatever_the_stored_sign', () => {
    expect(formatTransactionAmount(-8420, 'expense', 'en-AU')).toBe(`${MINUS}$84.20`)
    expect(formatTransactionAmount(-320000, 'income', 'en-AU')).toBe('+$3,200.00')
  })
})

describe('formatMoneySpoken', () => {
  it('test_spells_the_currency_for_screen_readers', () => {
    expect(formatMoneySpoken(4250, 'en-AU')).toContain('Australian dollars')
    expect(formatMoneySpoken(4250, 'es-MX')).toContain('dólares australianos')
  })
})

describe('keypad entry', () => {
  it('test_digits_shift_in_from_the_cents', () => {
    expect(parseKeypad(['4'])).toBe(4)
    expect(parseKeypad(['4', '2'])).toBe(42)
    expect(parseKeypad(['4', '2', '5', '0'])).toBe(4250)
  })

  it('test_double_zero_appends_two_zeros_for_whole_dollars', () => {
    expect(parseKeypad(['5', '00'])).toBe(500)
    expect(parseKeypad(['4', '2', '00'])).toBe(4200)
  })

  it('test_leading_zeros_do_not_change_the_value', () => {
    expect(parseKeypad(['0', '0', '7'])).toBe(7)
    expect(parseKeypad(['00'])).toBe(0)
  })

  it('test_backspace_drops_the_last_digit', () => {
    expect(applyKeypadKey(4250, 'backspace')).toBe(425)
    expect(applyKeypadKey(4, 'backspace')).toBe(0)
    expect(applyKeypadKey(0, 'backspace')).toBe(0)
  })

  it('test_clear_resets_to_zero', () => {
    expect(applyKeypadKey(4250, 'clear')).toBe(0)
  })

  it('test_entry_stops_at_the_maximum_amount', () => {
    expect(MAX_KEYPAD_CENTS).toBe(99999999)
    expect(applyKeypadKey(99999999, '9')).toBe(99999999)
    expect(applyKeypadKey(9999999, '00')).toBe(9999999)
    expect(applyKeypadKey(9999999, '9')).toBe(99999999)
  })

  it('test_double_zero_that_would_overflow_is_ignored', () => {
    expect(applyKeypadKey(1000000, '00')).toBe(1000000)
  })
})
