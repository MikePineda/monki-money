import { test } from '@japa/runner'
import { MAX_CSV_BYTES, MAX_CSV_ROWS } from '#importers/bank_csv_parser'
import {
  CsvEncodingError,
  CsvInvalidValueError,
  CsvMalformedError,
  CsvTooLargeError,
  CsvTooManyRowsError,
  CsvUnknownFormatError,
} from '#importers/errors'
import { NabCsvParser } from '#importers/nab/parser'
import { NAB_HEADER, nabCsv, nabFixture, thrown } from '#tests/helpers/importing'

const parser = new NabCsvParser()
const PURCHASE =
  '21 Sept 26,-163.40,123456789,,MISCELLANEOUS DEBIT,V2222 19/09 FRESHCO MARKET NORTHVALE 70000000601,7714.24,Groceries,FreshCo Market (Northvale Village),21 Sept 26'

test.group('Importing / NAB parser', () => {
  test('test_parser_reads_nab_columns_into_typed_rows', ({ assert }) => {
    const [row] = parser.parse(nabCsv([PURCHASE]))
    assert.deepEqual(row, {
      rowIndex: 0,
      accountNumber: '123456789',
      bankDate: '2026-09-21',
      amountCents: -16340,
      balanceCents: 771424,
      transactionType: 'MISCELLANEOUS DEBIT',
      detailsRaw: 'V2222 19/09 FRESHCO MARKET NORTHVALE 70000000601',
      details: 'V2222 19/09 FRESHCO MARKET NORTHVALE 70000000601',
      nabCategory: 'Groceries',
      nabMerchant: 'FreshCo Market (Northvale Village)',
      processedOn: '2026-09-21',
      isPending: false,
      raw: {
        date: '21 Sept 26',
        amount: '-163.40',
        accountNumber: '123456789',
        unnamed: '',
        transactionType: 'MISCELLANEOUS DEBIT',
        transactionDetails: 'V2222 19/09 FRESHCO MARKET NORTHVALE 70000000601',
        balance: '7714.24',
        category: 'Groceries',
        merchantName: 'FreshCo Market (Northvale Village)',
        processedOn: '21 Sept 26',
      },
    })
  })

  test('test_parser_decodes_html_entities_but_keeps_the_raw_details', ({ assert }) => {
    const [row] = parser.parse(
      nabCsv([
        '14 Aug 26,-66.15,123456789,,TRANSFER DEBIT,D ROE Z1000000003 Us &amp; Friends,8544.49,Transfers out,,14 Aug 26',
      ])
    )
    assert.equal(row.details, 'D ROE Z1000000003 Us & Friends')
    assert.equal(row.detailsRaw, 'D ROE Z1000000003 Us &amp; Friends')
    assert.isNull(row.nabMerchant)
  })

  test('test_parser_keeps_quoted_commas_and_pipes_in_details', ({ assert }) => {
    const rows = parser.parse(nabFixture('sample.csv'))
    assert.isTrue(rows.some((row) => row.details === "SAM EXAMPLEIt's me, Sam|"))
    assert.isTrue(rows.some((row) => row.nabMerchant === 'Sample Store (The Mall, Brisbane)'))

    const [backslash] = parser.parse(
      nabCsv([
        '16 July 26,-25.00,123456789,,EFTPOS DEBIT,EFTPOS 15/07 10:32PHONECO MOBILE\\,8362.15,Phone & internet,PhoneCo Mobile,16 July 26',
      ])
    )
    assert.equal(backslash.details, 'EFTPOS 15/07 10:32PHONECO MOBILE\\')
  })

  test('test_parser_marks_rows_without_processed_on_as_pending', ({ assert }) => {
    const [pending] = parser.parse(
      nabCsv([
        '26 Sept 26,-6.00,123456789,,EFTPOS DEBIT,POS 26/09 KMART 9999 SAMPLEVILLE,7262.31,Other shopping,Kmart (Sampleville),',
      ])
    )
    assert.isTrue(pending.isPending)
    assert.isNull(pending.processedOn)
  })

  test('test_parser_accepts_a_bom_and_any_line_ending', ({ assert }) => {
    for (const options of [{ bom: true }, { eol: '\n' }, { eol: '\r\n', bom: true }]) {
      const rows = parser.parse(nabCsv([PURCHASE, PURCHASE], options))
      assert.lengthOf(rows, 2)
      assert.equal(rows[1].rowIndex, 1)
      assert.equal(rows[0].bankDate, '2026-09-21')
    }
  })

  test('test_parser_rejects_a_different_header_with_a_typed_error', ({ assert }) => {
    const headers = [
      'Date,Amount,Account Number,Transaction Type,Transaction Details,Balance,Category,Merchant Name,Processed On',
      'Date,Amount,Description,Balance',
      NAB_HEADER.replace('Merchant Name', 'Merchant'),
    ]
    for (const header of headers) {
      const error = thrown(() => parser.parse(nabCsv([], { header })))
      assert.instanceOf(error, CsvUnknownFormatError)
      assert.equal((error as CsvUnknownFormatError).status, 422)
      assert.equal((error as CsvUnknownFormatError).code, 'E_CSV_UNKNOWN_FORMAT')
    }
    assert.instanceOf(
      thrown(() => parser.parse(Buffer.from(''))),
      CsvUnknownFormatError
    )
  })

  test('test_parser_rejects_rows_with_extra_or_missing_columns', ({ assert }) => {
    for (const line of [`${PURCHASE},extra`, PURCHASE.split(',').slice(0, 9).join(',')]) {
      const error = thrown(() => parser.parse(nabCsv([PURCHASE, line])))
      assert.instanceOf(error, CsvMalformedError)
      assert.equal((error as CsvMalformedError).code, 'E_CSV_MALFORMED')
      assert.equal((error as CsvMalformedError).line, 3)
    }
  })

  test('test_parser_rejects_an_unclosed_quote_with_a_typed_error', ({ assert }) => {
    const unclosed = PURCHASE.replace('FreshCo Market', '"FreshCo Market')
    const error = thrown(() => parser.parse(nabCsv([PURCHASE, unclosed])))
    assert.instanceOf(error, CsvMalformedError)
    assert.isNumber((error as CsvMalformedError).line)
  })

  test('test_parser_rejects_unreadable_values_naming_line_and_column', ({ assert }) => {
    const badDate = PURCHASE.replace('21 Sept 26,-163.40', '21 Sep 2026x,-163.40')
    const badAmount = PURCHASE.replace('-163.40', '-163.4x')
    const dateError = thrown(() => parser.parse(nabCsv([PURCHASE, badDate])))
    assert.instanceOf(dateError, CsvInvalidValueError)
    assert.include(dateError as CsvInvalidValueError, { line: 3, column: 'Date' })
    assert.include(thrown(() => parser.parse(nabCsv([badAmount]))) as CsvInvalidValueError, {
      line: 2,
      column: 'Amount',
    })
    const noAccount = PURCHASE.replace('123456789', ' ')
    assert.include(thrown(() => parser.parse(nabCsv([noAccount]))) as CsvInvalidValueError, {
      column: 'Account Number',
    })
  })

  test('test_parser_rejects_bytes_that_are_not_utf8', ({ assert }) => {
    const latin1 = Buffer.concat([nabCsv([]), Buffer.from([0x43, 0x61, 0x66, 0xe9, 0x0d, 0x0a])])
    const error = thrown(() => parser.parse(latin1))
    assert.instanceOf(error, CsvEncodingError)
    assert.equal((error as CsvEncodingError).code, 'E_CSV_ENCODING')
  })

  test('test_file_size_and_row_limits_are_two_megabytes_and_twenty_thousand_rows', ({ assert }) => {
    assert.equal(MAX_CSV_BYTES, 2 * 1024 * 1024)
    assert.equal(MAX_CSV_ROWS, 20_000)

    const tooLarge = Buffer.alloc(MAX_CSV_BYTES + 1, 0x20)
    assert.instanceOf(
      thrown(() => parser.parse(tooLarge)),
      CsvTooLargeError
    )

    const short = '01 Jan 26,-.50,1,,D,X,1,C,M,01 Jan 26'
    const tooMany = nabCsv(Array.from({ length: MAX_CSV_ROWS + 1 }, () => short))
    assert.isAtMost(tooMany.length, MAX_CSV_BYTES)
    assert.instanceOf(
      thrown(() => parser.parse(tooMany)),
      CsvTooManyRowsError
    )
  })

  test('test_header_only_file_has_no_rows', ({ assert }) => {
    assert.deepEqual(parser.parse(nabCsv([])), [])
  })

  test('test_nab_parser_detects_its_own_header_only', ({ assert }) => {
    assert.isTrue(parser.detect(NAB_HEADER))
    assert.isTrue(parser.detect(`\uFEFF${NAB_HEADER}\r`))
    assert.isTrue(parser.detect(NAB_HEADER.toUpperCase()))
    assert.isFalse(parser.detect('Date,Amount,Description,Balance'))
    assert.isFalse(parser.detect('"unterminated'))
    assert.equal(parser.source, 'nab_csv')
  })
})
