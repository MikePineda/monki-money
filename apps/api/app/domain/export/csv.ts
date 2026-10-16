/**
 * CSV for spreadsheets (RFC 4180, CRLF) with formula-injection escaping:
 * a text cell starting with `=`, `+`, `-`, `@`, a tab or a carriage return
 * gets a leading `'` so Excel/Sheets/Numbers show it as text instead of
 * evaluating it (OWASP "CSV injection"). Numbers, booleans and strictly
 * numeric strings ('-12.34') are emitted as-is: a plain number cannot be a
 * formula, and amounts must stay numbers for the spreadsheet.
 */

export type CsvValue = string | number | boolean | null | undefined

const FORMULA_PREFIX = /^[=+\-@\t\r]/
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/

export function escapeFormula(text: string): string {
  return FORMULA_PREFIX.test(text) && !PLAIN_NUMBER.test(text) ? `'${text}` : text
}

export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return ''
  if (typeof value !== 'string') return String(value)

  const text = escapeFormula(value)
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/**
 * A JSON-shaped value as one CSV cell: lists of strings (tags) join with
 * "; ", other lists and objects become their JSON text; scalars stay as
 * they are. The result still goes through `csvCell` (escaping included).
 */
export function flatCell(value: unknown): CsvValue {
  if (value === null || value === undefined) return null
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value.join('; ')
  }
  if (typeof value === 'object') return JSON.stringify(value)
  return value as CsvValue
}

/** One CSV record, terminated by CRLF. */
export function csvRow(values: CsvValue[]): string {
  return `${values.map(csvCell).join(',')}\r\n`
}
