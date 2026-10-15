import { test } from '@japa/runner'
import { csvCell, csvRow, escapeFormula } from '#domain/export/csv'

test.group('Export: CSV', () => {
  test('test_csv_cell_escapes_formula_prefixes', ({ assert }) => {
    assert.equal(escapeFormula('=SUM(A1:A9)'), "'=SUM(A1:A9)")
    assert.equal(escapeFormula('+61 400'), "'+61 400")
    assert.equal(escapeFormula('-5 kids'), "'-5 kids")
    assert.equal(escapeFormula('@cmd'), "'@cmd")
    assert.equal(escapeFormula('\tTAB'), "'\tTAB")
    assert.equal(escapeFormula('\rCR'), "'\rCR")
    assert.equal(escapeFormula('Woolworths'), 'Woolworths')
    assert.equal(escapeFormula(''), '')
  })

  test('test_csv_cell_quotes_separators_and_quotes', ({ assert }) => {
    assert.equal(csvCell('plain'), 'plain')
    assert.equal(csvCell('a,b'), '"a,b"')
    assert.equal(csvCell('say "hi"'), '"say ""hi"""')
    assert.equal(csvCell('two\nlines'), '"two\nlines"')
    assert.equal(csvCell('=HYPERLINK("http://x")'), `"'=HYPERLINK(""http://x"")"`)
    assert.equal(csvCell(null), '')
    assert.equal(csvCell(true), 'true')
  })

  test('test_numbers_we_generate_are_not_escaped', ({ assert }) => {
    // Amounts come from integers, never from user text: a negative amount
    // stays a number for the spreadsheet.
    assert.equal(csvCell(-1234), '-1234')
    assert.equal(csvCell('-12.34'), '-12.34')
    assert.equal(csvCell('-12.34 refund'), "'-12.34 refund")
    assert.equal(csvCell('-1+1'), "'-1+1")
    assert.equal(csvRow(['2026-10-01', '-12.34', '=evil']), `2026-10-01,-12.34,'=evil\r\n`)
  })
})
