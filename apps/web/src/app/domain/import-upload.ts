/**
 * Uploading a bank CSV (`POST /imports`). Pure: no Angular. The file is
 * checked on the device before it leaves (size and format), and every
 * answer of the API becomes one {@link UploadOutcome} the screen can switch
 * on: staged batches, account numbers to map, a batch already waiting for
 * review, a malformed file (with its line and column), a plan limit.
 */

/** The API's cap (`MAX_CSV_BYTES`): bigger files are refused before upload. */
export const MAX_CSV_BYTES = 2 * 1024 * 1024

/** What the `<input type="file">` offers. */
export const CSV_ACCEPT = '.csv,text/csv'

export type CsvFileProblem = 'tooLarge' | 'empty' | 'notCsv'

export interface FileFacts {
  name: string
  size: number
  type: string
}

/**
 * Why a picked file cannot be uploaded, or null when it can. Some systems
 * label CSV files as Excel or plain text, so a `.csv` name is enough.
 */
export function checkCsvFile(file: FileFacts): CsvFileProblem | null {
  const isCsv =
    /\.csv$/i.test(file.name) || file.type === 'text/csv' || file.type === 'application/csv'
  if (!isCsv) {
    return 'notCsv'
  }
  if (file.size === 0) {
    return 'empty'
  }
  if (file.size > MAX_CSV_BYTES) {
    return 'tooLarge'
  }
  return null
}

/** Every answer of `POST /imports`, by what the screen does next. */
export type UploadOutcome<Batch = unknown> =
  | { kind: 'staged'; batches: Batch[] }
  | { kind: 'unknownAccounts'; accountNumbers: string[] }
  | { kind: 'batchOpen'; batchId: number; accountId: number | null }
  | {
      kind: 'csvError'
      code: string
      message: string | null
      line: number | null
      column: string | null
    }
  | { kind: 'invalid'; fields: Record<string, string> }
  | { kind: 'limitReached' }
  | { kind: 'unauthorized' }
  | { kind: 'throttled' }
  | { kind: 'failed'; status: number }

type Body = Record<string, unknown>

function asBody(body: unknown): Body {
  return typeof body === 'object' && body !== null ? (body as Body) : {}
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

function fieldMessages(body: Body): Record<string, string> {
  const fields: Record<string, string> = {}
  if (!Array.isArray(body['errors'])) {
    return fields
  }
  for (const item of body['errors'] as unknown[]) {
    const { field, message } = asBody(item)
    if (typeof field === 'string' && typeof message === 'string') {
      fields[field] ??= message
    }
  }
  return fields
}

/** Reads the status and JSON body of `POST /imports` into an outcome. */
export function uploadOutcome<Batch = unknown>(
  status: number,
  rawBody: unknown
): UploadOutcome<Batch> {
  const body = asBody(rawBody)
  const code = text(body['code'])
  if (status >= 200 && status < 300) {
    return { kind: 'staged', batches: Array.isArray(body['data']) ? (body['data'] as Batch[]) : [] }
  }
  if (status === 401) {
    return { kind: 'unauthorized' }
  }
  if (status === 429) {
    return { kind: 'throttled' }
  }
  if (status === 402 && code === 'E_IMPORT_LIMIT_REACHED') {
    return { kind: 'limitReached' }
  }
  if (status === 409 && code === 'E_IMPORT_BATCH_OPEN') {
    return {
      kind: 'batchOpen',
      batchId: count(body['batchId']) ?? 0,
      accountId: count(body['accountId']),
    }
  }
  if (status === 422) {
    if (code === 'E_IMPORT_UNKNOWN_ACCOUNTS') {
      const numbers = Array.isArray(body['accountNumbers']) ? body['accountNumbers'] : []
      return {
        kind: 'unknownAccounts',
        accountNumbers: numbers.filter((item): item is string => typeof item === 'string'),
      }
    }
    if (code?.startsWith('E_CSV_')) {
      return {
        kind: 'csvError',
        code,
        message: text(body['message']),
        line: count(body['line']),
        column: text(body['column']),
      }
    }
    return { kind: 'invalid', fields: fieldMessages(body) }
  }
  return { kind: 'failed', status }
}

/** Where a successful upload leads, from the batches it staged. */
export type StagedNext =
  | { next: 'review'; batchId: number }
  | { next: 'choose'; batchIds: number[] }
  | { next: 'nothingNew' }

/**
 * One batch per account of the file: a single staged batch opens its
 * review, several are offered one by one, and a re-upload with nothing new
 * (every batch completed at once) says so.
 */
export function stagedOutcome(batches: readonly { id: number; status: string }[]): StagedNext {
  const staged = batches.filter((batch) => batch.status === 'staged').map((batch) => batch.id)
  if (staged.length === 0) {
    return { next: 'nothingNew' }
  }
  if (staged.length === 1) {
    return { next: 'review', batchId: staged[0] as number }
  }
  return { next: 'choose', batchIds: staged }
}

/** A bank account number as the screen shows it: only its last four digits. */
export function maskAccountNumber(accountNumber: string): string {
  return `•••• ${accountNumber.slice(-4)}`
}
