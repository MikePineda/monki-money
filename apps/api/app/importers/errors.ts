import { Exception } from '@adonisjs/core/exceptions'

/**
 * Why an uploaded CSV was rejected. Every error answers 422 through the
 * global handler, which renders `{ message, code }` with the message
 * translated from `errors.<code>`; `line` / `column` point at the culprit
 * (1-based line, header included) when there is one.
 */
export class CsvImportError extends Exception {
  static override status = 422

  constructor(
    message?: string,
    readonly line: number | null = null,
    readonly column: string | null = null
  ) {
    super(message)
  }
}

export class CsvTooLargeError extends CsvImportError {
  static override code = 'E_CSV_TOO_LARGE'
  static override message = 'The file is larger than 2 MB'
}

export class CsvTooManyRowsError extends CsvImportError {
  static override code = 'E_CSV_TOO_MANY_ROWS'
  static override message = 'The file has more than 20000 rows'
}

export class CsvEncodingError extends CsvImportError {
  static override code = 'E_CSV_ENCODING'
  static override message = 'The file is not valid UTF-8 text'
}

/** The header does not match any supported bank export. */
export class CsvUnknownFormatError extends CsvImportError {
  static override code = 'E_CSV_UNKNOWN_FORMAT'
  static override message = 'The file is not a supported bank export'
}

/** Broken CSV structure: wrong column count, unclosed quote... */
export class CsvMalformedError extends CsvImportError {
  static override code = 'E_CSV_MALFORMED'
  static override message = 'The file is not a well-formed CSV'
}

/** A cell that cannot be read (date, amount, account number). */
export class CsvInvalidValueError extends CsvImportError {
  static override code = 'E_CSV_INVALID_VALUE'
  static override message = 'The file has a value that cannot be read'
}
