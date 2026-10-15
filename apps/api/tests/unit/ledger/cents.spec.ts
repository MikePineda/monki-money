import { test } from '@japa/runner'
import { centsToDecimal, formatCents, parseCents, splitEvenly, sumCents } from '#domain/money/cents'

test.group('Money: cents', () => {
  test('test_parse_cents_reads_decimal_amounts_without_floats', ({ assert }) => {
    assert.strictEqual(parseCents('12.34'), 1234)
    assert.strictEqual(parseCents('-12.34'), -1234)
    assert.strictEqual(parseCents('-.50'), -50)
    assert.strictEqual(parseCents('.91'), 91)
    assert.strictEqual(parseCents('7'), 700)
    assert.strictEqual(parseCents('7.5'), 750)
    assert.strictEqual(parseCents('+3.10'), 310)
    assert.strictEqual(parseCents(' $1,234.56 '), 123456)
    assert.strictEqual(parseCents('-$0.01'), -1)
    // 0.1 + 0.2 style float drift never happens: the digits are read as text.
    assert.strictEqual(parseCents('1000000.29'), 100000029)
  })

  test('test_parse_cents_rejects_malformed_input', ({ assert }) => {
    for (const input of ['', 'abc', '1.234', '1,23.00', '--1', '1.2.3', '$', '.', '1e3']) {
      assert.isNull(parseCents(input), input)
    }
  })

  test('test_sum_cents_adds_integers_and_refuses_floats', ({ assert }) => {
    assert.strictEqual(sumCents([]), 0)
    assert.strictEqual(sumCents([100, -250, 5]), -145)
    assert.throws(() => sumCents([100, 0.5]))
  })

  test('test_split_evenly_assigns_remainder_to_first_line', ({ assert }) => {
    assert.deepEqual(splitEvenly(1000, 3), [334, 333, 333])
    assert.deepEqual(splitEvenly(1001, 3), [335, 333, 333])
    assert.deepEqual(splitEvenly(-1001, 3), [-335, -333, -333])
    assert.deepEqual(splitEvenly(2, 3), [2, 0, 0])
    assert.deepEqual(splitEvenly(900, 1), [900])
    assert.strictEqual(sumCents(splitEvenly(98765, 7)), 98765)
    assert.throws(() => splitEvenly(100, 0))
    assert.throws(() => splitEvenly(10.5, 2))
  })

  test('test_cents_to_decimal_is_exact', ({ assert }) => {
    assert.strictEqual(centsToDecimal(1234), '12.34')
    assert.strictEqual(centsToDecimal(-1234), '-12.34')
    assert.strictEqual(centsToDecimal(-5), '-0.05')
    assert.strictEqual(centsToDecimal(0), '0.00')
    assert.strictEqual(centsToDecimal(100000029), '1000000.29')
  })

  test('test_format_cents_uses_the_currency_and_locale', ({ assert }) => {
    assert.strictEqual(formatCents(123456), '$1,234.56')
    assert.strictEqual(formatCents(-50), '-$0.50')
    assert.include(formatCents(1999, { locale: 'es-MX', currency: 'AUD' }), '19.99')
  })
})
