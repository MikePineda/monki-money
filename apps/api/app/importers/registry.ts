import type { ImportSource, ParsedRow } from '#domain/importing/types'
import { type BankCsvParser, MAX_CSV_BYTES } from '#importers/bank_csv_parser'
import { CsvTooLargeError, CsvUnknownFormatError } from '#importers/errors'
import { NabCsvParser } from '#importers/nab/parser'

/** Every supported bank export. Order matters only if two headers ever overlap. */
export const BANK_CSV_PARSERS: readonly BankCsvParser[] = [new NabCsvParser()]

/** Header line of an upload: up to the first line break, without BOM or `\r`. */
export function firstLine(buffer: Buffer): string {
  const newline = buffer.indexOf(0x0a)
  const head = buffer.subarray(0, newline === -1 ? Math.min(buffer.length, 4096) : newline)
  return head
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .replace(/\r$/, '')
}

/** The parser whose `detect` accepts the header line; 422 when none does. */
export function detectBankCsvParser(
  buffer: Buffer,
  parsers: readonly BankCsvParser[] = BANK_CSV_PARSERS
): BankCsvParser {
  const header = firstLine(buffer)
  const parser = parsers.find((candidate) => candidate.detect(header))
  if (!parser) throw new CsvUnknownFormatError()
  return parser
}

/**
 * Entry point of the import pipeline: size guard, parser detection and
 * strict parsing. Throws a `CsvImportError` (422) on any problem.
 */
export function parseBankCsv(
  buffer: Buffer,
  parsers: readonly BankCsvParser[] = BANK_CSV_PARSERS
): { source: ImportSource; rows: ParsedRow[] } {
  if (buffer.length > MAX_CSV_BYTES) throw new CsvTooLargeError()
  const parser = detectBankCsvParser(buffer, parsers)
  return { source: parser.source, rows: parser.parse(buffer) }
}
