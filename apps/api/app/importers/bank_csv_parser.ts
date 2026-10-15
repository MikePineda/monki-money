import type { ImportSource, ParsedRow } from '#domain/importing/types'

/** Largest CSV the API accepts: the multipart reader stops at this size (422 beyond). */
export const MAX_CSV_BYTES = 2 * 1024 * 1024

/** Most data rows one CSV may carry (422 beyond). */
export const MAX_CSV_ROWS = 20_000

/**
 * Strategy for one bank's CSV export. `detect` looks at the header line
 * only; `parse` validates the whole file (UTF-8, exact header, strict
 * column count, limits) and returns typed rows in file order, or throws a
 * `CsvImportError` (422). A new bank is a new implementation registered in
 * `app/importers/registry.ts`; the rest of the pipeline does not change.
 */
export interface BankCsvParser {
  readonly source: ImportSource
  detect(headerLine: string): boolean
  parse(buffer: Buffer): ParsedRow[]
}
