import { test } from '@japa/runner'
import { CsvTooLargeError, CsvUnknownFormatError } from '#importers/errors'
import { MAX_CSV_BYTES } from '#importers/bank_csv_parser'
import { detectBankCsvParser, firstLine, parseBankCsv } from '#importers/registry'
import { nabCsv, nabFixture, thrown } from '#tests/helpers/importing'

test.group('Importing / parser registry', () => {
  test('test_registry_picks_the_parser_from_the_header_line', ({ assert }) => {
    assert.equal(detectBankCsvParser(nabFixture('sample.csv')).source, 'nab_csv')
    assert.equal(detectBankCsvParser(nabCsv([], { bom: true })).source, 'nab_csv')
  })

  test('test_registry_rejects_an_unknown_export_with_a_typed_error', ({ assert }) => {
    const error = thrown(() => detectBankCsvParser(Buffer.from('Date,Amount,Description\n')))
    assert.instanceOf(error, CsvUnknownFormatError)
    assert.instanceOf(
      thrown(() => parseBankCsv(Buffer.from(''))),
      CsvUnknownFormatError
    )
  })

  test('test_registry_rejects_oversized_files_before_reading_them', ({ assert }) => {
    const tooLarge = Buffer.concat([nabCsv([]), Buffer.alloc(MAX_CSV_BYTES, 0x20)])
    assert.instanceOf(
      thrown(() => parseBankCsv(tooLarge)),
      CsvTooLargeError
    )
  })

  test('test_parse_bank_csv_returns_the_source_and_rows', ({ assert }) => {
    const { source, rows } = parseBankCsv(nabFixture('sample.csv'))
    assert.equal(source, 'nab_csv')
    assert.lengthOf(rows, 35)
  })

  test('test_first_line_strips_the_bom_and_line_ending', ({ assert }) => {
    assert.equal(firstLine(Buffer.from('\uFEFFa,b\r\nc,d\r\n')), 'a,b')
    assert.equal(firstLine(Buffer.from('a,b')), 'a,b')
  })
})
