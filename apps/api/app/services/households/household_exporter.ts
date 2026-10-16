import { DateTime } from 'luxon'
import type { I18n } from '@adonisjs/i18n'
import type Household from '#models/household'
import { csvRow, flatCell } from '#domain/export/csv'
import type { PrivacyViewer } from '#domain/ledger/privacy'
import { isoTimestamp } from '#domain/time/iso_timestamp'
import { zipStream, type ZipEntry } from '#domain/export/zip'
import LedgerCsvExporter from '#services/households/ledger_csv_exporter'
import {
  exportTables,
  householdRow,
  type ExportRow,
  type ExportTable,
} from '#services/households/export_tables'

const PAGE_SIZE = 500

/**
 * Full export of a household ("download my data"), streamed as it is read
 * so memory stays flat as tables grow (app/services/households/export_tables.ts
 * has the tables, their scoping, paging and privacy rules).
 *
 * - JSON: one object with the household and one array per table.
 * - CSV: a zip with one CSV per table (same columns as the JSON rows,
 *   UTF-8 BOM, every text cell escaped against formula injection) plus
 *   `ledger.csv`, the ledger as a spreadsheet in the reader's language
 *   (LedgerCsvExporter). A zip rather than one multi-section CSV: each
 *   table keeps its own header and opens as a sheet of its own.
 */
export default class HouseholdExporter {
  constructor(
    protected pageSize = PAGE_SIZE,
    protected ledger = new LedgerCsvExporter(pageSize)
  ) {}

  async *json(household: Household, viewer: PrivacyViewer): AsyncGenerator<string> {
    yield `{"format":"monkimoney-export","version":2,"exportedAt":${JSON.stringify(
      isoTimestamp(DateTime.now())
    )}`
    yield `,"household":${JSON.stringify(householdRow(household))}`

    for (const table of exportTables(household, viewer, this.pageSize)) {
      yield* this.section(table)
    }

    yield '}\n'
  }

  zip(household: Household, viewer: PrivacyViewer, i18n?: I18n): AsyncGenerator<Buffer> {
    const tables = exportTables(household, viewer, this.pageSize)
    const ledger = this.ledger
    async function* entries(): AsyncGenerator<ZipEntry> {
      yield { name: 'ledger.csv', content: ledger.csv(household, viewer, i18n) }
      yield { name: 'household.csv', content: csvFile(householdTable(household)) }
      for (const table of tables) yield { name: table.file, content: csvFile(table) }
    }
    return zipStream(entries())
  }

  /** One JSON array, a row per chunk. */
  protected async *section(table: ExportTable): AsyncGenerator<string> {
    yield `,${JSON.stringify(table.name)}:[`
    let first = true
    for await (const row of table.rows()) {
      yield `${first ? '' : ','}${JSON.stringify(row)}`
      first = false
    }
    yield ']'
  }
}

/** The household as a one-row table. */
function householdTable(household: Household): ExportTable {
  const row = householdRow(household)
  return {
    name: 'household',
    file: 'household.csv',
    columns: Object.keys(row),
    async *rows() {
      yield row
    },
  }
}

/** Characters gathered before a chunk goes to the compressor. */
const CHUNK_SIZE = 64 * 1024

/** A table as CSV: BOM, header, one escaped record per row. */
async function* csvFile(table: ExportTable): AsyncGenerator<string> {
  let chunk = `\uFEFF${csvRow([...table.columns])}`
  for await (const row of table.rows()) {
    chunk += csvRow(table.columns.map((column) => flatCell((row as ExportRow)[column])))
    if (chunk.length >= CHUNK_SIZE) {
      yield chunk
      chunk = ''
    }
  }
  if (chunk) yield chunk
}
