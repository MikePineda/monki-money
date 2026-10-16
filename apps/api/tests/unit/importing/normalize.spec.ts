import { test } from '@japa/runner'
import { InvalidBankValueError } from '#domain/importing/errors'
import {
  cardSuffix,
  effectiveDate,
  extractPurchaseDate,
  isPending,
  linkedAccountHolder,
  merchantFullKey,
  merchantKey,
  normalizeDescription,
  parseAmountToCents,
  parseNabDate,
} from '#domain/importing/normalize'

test.group('Importing / NAB dates', () => {
  test('test_parse_nab_date_handles_sept_july_june', ({ assert }) => {
    assert.equal(parseNabDate('27 Sept 26'), '2026-09-27')
    assert.equal(parseNabDate('31 July 26'), '2026-07-31')
    assert.equal(parseNabDate('29 June 26'), '2026-06-29')
    assert.equal(parseNabDate('04 Sep 26'), '2026-09-04')
    assert.equal(parseNabDate('2 Jan 27'), '2027-01-02')
    assert.equal(parseNabDate(' 22 Dec 25 '), '2025-12-22')
    assert.equal(parseNabDate('29 Feb 28'), '2028-02-29')
  })

  test('test_parse_nab_date_rejects_impossible_or_garbled_dates', ({ assert }) => {
    for (const value of [
      '31 June 26',
      '29 Feb 26',
      '00 Jan 26',
      '12 Foo 26',
      '2026-09-27',
      '',
      '27 Sept',
    ]) {
      assert.throws(() => parseNabDate(value), /^Invalid date/)
    }
  })

  test('test_unreadable_bank_values_raise_a_typed_error_naming_the_field', ({ assert }) => {
    const failures = [() => parseNabDate('nope'), () => parseAmountToCents('1.2.3')]
    const errors = failures.map((read) => {
      try {
        read()
      } catch (error) {
        return error
      }
      return null
    })
    assert.instanceOf(errors[0], InvalidBankValueError)
    assert.equal((errors[0] as InvalidBankValueError).field, 'date')
    assert.equal((errors[1] as InvalidBankValueError).field, 'amount')
  })
})

test.group('Importing / amounts', () => {
  test('test_parse_amount_handles_leading_dot_and_negative_zero', ({ assert }) => {
    assert.equal(parseAmountToCents('-.50'), -50)
    assert.equal(parseAmountToCents('.91'), 91)
    assert.equal(parseAmountToCents('.01'), 1)
    assert.isTrue(Object.is(parseAmountToCents('-0.00'), 0))
    assert.isTrue(Object.is(parseAmountToCents('-.00'), 0))
  })

  test('test_parse_amount_uses_integer_arithmetic', ({ assert }) => {
    assert.equal(parseAmountToCents('-5.00'), -500)
    assert.equal(parseAmountToCents('6378.50'), 637850)
    assert.equal(parseAmountToCents('9471.2'), 947120)
    assert.equal(parseAmountToCents('200'), 20000)
    assert.equal(parseAmountToCents('+12.34'), 1234)
    // 0.29 * 100 is 28.999999999999996 in floating point.
    assert.equal(parseAmountToCents('-70.29'), -7029)
    assert.equal(parseAmountToCents('1000000000.01'), 100000000001)
  })

  test('test_parse_amount_rejects_malformed_values', ({ assert }) => {
    for (const value of [
      '',
      '-',
      '.',
      '1.234',
      '1,234.00',
      'abc',
      '12.3.4',
      '1e3',
      '9999999999999.00',
    ]) {
      assert.throws(() => parseAmountToCents(value), /^Invalid amount/)
    }
  })
})

test.group('Importing / purchase date', () => {
  test('test_effective_date_reads_the_dd_mm_token_after_the_card_prefix', ({ assert }) => {
    assert.equal(
      extractPurchaseDate('V2222 19/09 FRESHCO MARKET NORTHVALE 70000000601', '2026-09-21'),
      '2026-09-19'
    )
    assert.equal(
      extractPurchaseDate('POS 26/09 KMART 9999 SAMPLEVILLE', '2026-09-26'),
      '2026-09-26'
    )
    assert.equal(
      extractPurchaseDate('EFTPOS 23/08 21:32CORNER BURGERS PTY BRISBANE', '2026-08-25'),
      '2026-08-23'
    )
  })

  test('test_effective_date_rolls_year_back_in_january', ({ assert }) => {
    assert.equal(
      extractPurchaseDate('V1111 30/12 RIVERSIDE DELI EASTBROOK 70000000101', '2026-01-02'),
      '2025-12-30'
    )
    assert.equal(
      effectiveDate('V2222 31/12 TRANSLINK TICKETING QLD 70000000102', '2026-01-02'),
      '2025-12-31'
    )
  })

  test('test_effective_date_falls_back_to_the_bank_date', ({ assert }) => {
    assert.isNull(extractPurchaseDate('INTERNET BPAY DEFT REAL ESTATE 0012345678', '2026-09-17'))
    assert.isNull(extractPurchaseDate('J DOE C1000000002 paid 12/08', '2026-08-12'))
    assert.equal(effectiveDate('CASH', '2025-12-22'), '2025-12-22')
  })

  test('test_purchase_date_more_than_a_month_before_posting_is_ignored', ({ assert }) => {
    // 03/01 after a 02 Jan posting would roll back a whole year: not a purchase date.
    assert.isNull(extractPurchaseDate('V1111 03/01 SOMEWHERE 70000000001', '2026-01-02'))
    assert.isNull(extractPurchaseDate('V1111 31/02 SOMEWHERE 70000000001', '2026-03-02'))
  })
})

test.group('Importing / descriptions and merchants', () => {
  test('test_normalize_strips_card_prefix_date_and_auth_code', ({ assert }) => {
    assert.equal(
      normalizeDescription('V1111 29/08 RIVERSIDE DELI EASTBROOK 70000000501'),
      'RIVERSIDE DELI EASTBROOK'
    )
    assert.equal(normalizeDescription('POS 26/09 KMART 9999 SAMPLEVILLE'), 'KMART 9999 SAMPLEVILLE')
    assert.equal(
      normalizeDescription('V1111 26/09 KMART 9999 SAMPLEVILLE 70000009001'),
      'KMART 9999 SAMPLEVILLE'
    )
    assert.equal(
      normalizeDescription('EFTPOS 23/08 21:32CORNER BURGERS PTY BRISBANE'),
      'CORNER BURGERS PTY BRISBANE'
    )
    assert.equal(
      normalizeDescription('ONLINE A1000000001 Linked Acc Trns SAMPLE HOUSEHO'),
      'Linked Acc Trns SAMPLE HOUSEHO'
    )
    assert.equal(normalizeDescription('J DOE C1000000002 hot pot'), 'J DOE hot pot')
    assert.equal(normalizeDescription('  CASH  '), 'CASH')
  })

  test('test_merchant_key_prefers_nab_merchant_name', ({ assert }) => {
    const withMerchant = {
      nabMerchant: 'FreshCo Market (Northvale Village)',
      description: 'FRESHCO MARKET NORTHVALE',
    }
    assert.equal(merchantKey(withMerchant), 'freshco market')
    assert.equal(merchantFullKey(withMerchant), 'freshco market northvale village')

    const withoutMerchant = { nabMerchant: null, description: 'GROCERMART/8 SAMPLE ROA NORTHVALE' }
    assert.equal(merchantKey(withoutMerchant), 'grocermart sample roa northvale')
    assert.equal(merchantFullKey(withoutMerchant), 'grocermart sample roa northvale')
  })

  test('test_merchant_keys_drop_accents_punctuation_and_numbers', ({ assert }) => {
    const input = { nabMerchant: "Domino's Pizza (Café 12, Northvale)", description: '' }
    assert.equal(merchantKey(input), 'dominos pizza')
    assert.equal(merchantFullKey(input), 'dominos pizza cafe northvale')
    assert.equal(
      merchantFullKey({ nabMerchant: null, description: 'Hnry - INV-1000001 HNRY Cardholder One' }),
      'hnry inv hnry cardholder one'
    )
    assert.equal(merchantFullKey({ nabMerchant: '  ', description: '12345' }), '')
  })

  test('test_card_suffix_comes_from_the_v_prefix', ({ assert }) => {
    assert.equal(cardSuffix('V1111 26/09 KMART 9999 SAMPLEVILLE 70000009001'), '1111')
    assert.equal(cardSuffix('V2222 19/09 FRESHCO MARKET NORTHVALE 70000000601'), '2222')
    assert.isNull(cardSuffix('POS 26/09 KMART 9999 SAMPLEVILLE'))
    assert.isNull(cardSuffix('INTERNET BPAY DEFT REAL ESTATE 0012345678'))
  })

  test('test_row_is_pending_while_processed_on_is_empty', ({ assert }) => {
    assert.isTrue(isPending(''))
    assert.isTrue(isPending('   '))
    assert.isFalse(isPending('27 Sept 26'))
  })
})

test.group('Importing / linked account holder', () => {
  test('test_linked_account_holder_is_the_trailing_run_of_upper_case_words', ({ assert }) => {
    assert.equal(linkedAccountHolder('ONLINE A1000000001 Linked Acc Trns SMITH JO'), 'SMITH JO')
    // A memo typed in the bank app replaces `Linked Acc Trns`; the holder stays.
    assert.equal(linkedAccountHolder('ONLINE A1000000002 Honeymoon SMITH JO'), 'SMITH JO')
    assert.equal(linkedAccountHolder('ONLINE A1000000003 xd SMITH JO'), 'SMITH JO')
    assert.equal(linkedAccountHolder('ONLINE  A1000000004   Car rego   SMITH  JO '), 'SMITH JO')
    assert.equal(
      linkedAccountHolder('ONLINE A1000000005 Linked Acc Trns SAMPLE HOUSEHO'),
      'SAMPLE HOUSEHO'
    )
  })

  test('test_a_compound_holder_name_is_kept_whole', ({ assert }) => {
    assert.equal(linkedAccountHolder('ONLINE A1000000006 Rent DE LA CRUZ MA'), 'DE LA CRUZ MA')
    assert.equal(
      linkedAccountHolder("ONLINE A1000000007 Linked Acc Trns O'NEIL-WARD PK"),
      "O'NEIL-WARD PK"
    )
  })

  test('test_a_single_word_holder_is_read', ({ assert }) => {
    assert.equal(linkedAccountHolder('ONLINE A1000000008 Groceries split NGUYEN'), 'NGUYEN')
  })

  test('test_details_without_a_trailing_name_have_no_holder', ({ assert }) => {
    assert.isNull(linkedAccountHolder('ONLINE C1000000010 Monthly saving'))
    assert.isNull(linkedAccountHolder('ONLINE A1000000009'))
    assert.isNull(linkedAccountHolder('INTERNET BPAY DEFT REAL ESTATE 0012345678'))
    assert.isNull(linkedAccountHolder(''))
  })
})
