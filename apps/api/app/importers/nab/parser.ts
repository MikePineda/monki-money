import { CsvError, parse as parseCsv } from 'csv-parse/sync'
import { InvalidBankValueError } from '#domain/importing/errors'
import { isPending, parseAmountToCents, parseNabDate } from '#domain/importing/normalize'
import type { ParsedRow } from '#domain/importing/types'
import { type BankCsvParser, MAX_CSV_BYTES, MAX_CSV_ROWS } from '#importers/bank_csv_parser'
import {
  CsvEncodingError,
  CsvInvalidValueError,
  CsvMalformedError,
  CsvTooLargeError,
  CsvTooManyRowsError,
  CsvUnknownFormatError,
} from '#importers/errors'
import { decodeHtmlEntities } from '#importers/html_entities'
import { NAB_HEADER_CELLS, NAB_RAW_KEYS, type NabRawRow } from '#importers/nab/types'

interface CsvRecord {
  record: string[]
  info: { lines: number }
}

const ACCOUNT_NUMBER = /^[A-Za-z0-9-]{1,34}$/

function isNabHeader(cells: readonly string[]): boolean {
  return (
    cells.length === NAB_HEADER_CELLS.length &&
    cells.every(
      (cell, index) => cell.trim().toLowerCase() === NAB_HEADER_CELLS[index].toLowerCase()
    )
  )
}

function decodeUtf8(buffer: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    throw new CsvEncodingError()
  }
}

/** Every record with the line it ends on; structural CSV errors become a 422 with the line. */
function readRecords(text: string): CsvRecord[] {
  try {
    return parseCsv(text, {
      bom: true,
      info: true,
      skip_empty_lines: true,
      relax_column_count: true,
    }) as unknown as CsvRecord[]
  } catch (error) {
    if (error instanceof CsvError) {
      const lines = error['lines']
      throw new CsvMalformedError(undefined, typeof lines === 'number' ? lines : null)
    }
    throw error
  }
}

function emptyToNull(value: string): string | null {
  const trimmed = decodeHtmlEntities(value).trim()
  return trimmed === '' ? null : trimmed
}

/**
 * NAB transactions export (`BankCsvParser` strategy). Strict: exact header
 * (the unnamed fourth column included), exactly ten cells per row, UTF-8,
 * at most `MAX_CSV_BYTES` / `MAX_CSV_ROWS`. Dates and amounts are typed
 * here; interpretation (purchase date, merchant, hash) happens in staging.
 */
export class NabCsvParser implements BankCsvParser {
  readonly source = 'nab_csv' as const

  detect(headerLine: string): boolean {
    try {
      const [cells] = parseCsv(headerLine.trim(), { bom: true, relax_column_count: true })
      return cells !== undefined && isNabHeader(cells)
    } catch {
      return false
    }
  }

  parse(buffer: Buffer): ParsedRow[] {
    if (buffer.length > MAX_CSV_BYTES) throw new CsvTooLargeError()

    const [header, ...data] = readRecords(decodeUtf8(buffer))
    if (!header || !isNabHeader(header.record)) throw new CsvUnknownFormatError()
    if (data.length > MAX_CSV_ROWS) throw new CsvTooManyRowsError()

    return data.map((entry, rowIndex) => {
      if (entry.record.length !== NAB_HEADER_CELLS.length) {
        throw new CsvMalformedError(undefined, entry.info.lines)
      }
      return this.#toParsedRow(entry.record, rowIndex, entry.info.lines)
    })
  }

  #toParsedRow(cells: string[], rowIndex: number, line: number): ParsedRow {
    const raw = Object.fromEntries(
      NAB_RAW_KEYS.map((key, index) => [key, cells[index]])
    ) as unknown as NabRawRow

    const read = <T>(column: number, value: string, reader: (value: string) => T): T => {
      try {
        return reader(value)
      } catch (error) {
        if (error instanceof InvalidBankValueError) {
          throw new CsvInvalidValueError(undefined, line, NAB_HEADER_CELLS[column])
        }
        throw error
      }
    }

    const accountNumber = raw.accountNumber.trim()
    if (!ACCOUNT_NUMBER.test(accountNumber)) {
      throw new CsvInvalidValueError(undefined, line, NAB_HEADER_CELLS[2])
    }
    const pending = isPending(raw.processedOn)

    return {
      rowIndex,
      accountNumber,
      bankDate: read(0, raw.date, parseNabDate),
      amountCents: read(1, raw.amount, parseAmountToCents),
      balanceCents: raw.balance.trim() === '' ? null : read(6, raw.balance, parseAmountToCents),
      transactionType: raw.transactionType.trim(),
      detailsRaw: raw.transactionDetails.trim(),
      details: decodeHtmlEntities(raw.transactionDetails).trim(),
      nabCategory: emptyToNull(raw.category),
      nabMerchant: emptyToNull(raw.merchantName),
      processedOn: pending ? null : read(9, raw.processedOn, parseNabDate),
      isPending: pending,
      raw,
    }
  }
}
