import { createHash } from 'node:crypto'

/**
 * Identity of an imported bank row (`import_rows.external_hash`, unique per
 * household + account):
 *
 *   sha256(accountNumber|bankDate|amountCents|detailsRaw|balanceCents|occurrence)
 *
 * `detailsRaw` is the details cell as written in the file (trimmed, entities
 * not decoded) and `bankDate` is ISO. Exports contain identical rows (two
 * phone bills on the same day): the running balance tells them apart,
 * except for zero-amount rows, hence `occurrence`, the 1-based rank of the
 * row among its identical twins in file order. Re-exporting the same period
 * yields the same hashes, so a re-import is all duplicates.
 */
export interface RowHashInput {
  accountNumber: string
  bankDate: string
  amountCents: number
  detailsRaw: string
  balanceCents: number | null
  occurrence: number
}

type OccurrenceFields = Omit<RowHashInput, 'occurrence'>

function hashedFields(row: OccurrenceFields): string {
  return [
    row.accountNumber,
    row.bankDate,
    String(row.amountCents),
    row.detailsRaw.trim(),
    row.balanceCents === null ? '' : String(row.balanceCents),
  ].join('|')
}

export function rowHash(row: RowHashInput): string {
  return createHash('sha256')
    .update(`${hashedFields(row)}|${row.occurrence}`)
    .digest('hex')
}

/** Occurrence of every row: 1 for the first of its identical twins, 2 for the next... */
export function assignOccurrences(rows: readonly OccurrenceFields[]): number[] {
  const seen = new Map<string, number>()
  return rows.map((row) => {
    const key = hashedFields(row)
    const occurrence = (seen.get(key) ?? 0) + 1
    seen.set(key, occurrence)
    return occurrence
  })
}
