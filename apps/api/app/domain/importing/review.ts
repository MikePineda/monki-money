import type { Resolution } from '#domain/importing/types'

/**
 * The review step between staging and the ledger: what confirm does with
 * each row once a person had the chance to decide, and how the bank's
 * balance compares with the ledger afterwards. Pure: the import service
 * feeds it the row as stored (proposal + decision merged).
 */

/** What confirm does with a row. */
export type ConfirmAction = 'create' | 'match' | 'transfer' | 'ignore'

/** A row as confirm sees it: the proposal with the person's decision applied. */
export interface ReviewRow {
  resolution: Resolution
  /** A person changed something on the row. */
  decided: boolean
  /** Ledger row to link (decision, else the matcher's pick). */
  matchTransactionId: number | null
  /** Other account of the transfer (decision, else detected). */
  transferAccountId: number | null
  /** Category of the new transaction (decision, else the suggestion). */
  categoryId: number | null
  hasSplits: boolean
  /** The transfer's other account is the importer's guess and nobody decided the row yet. */
  guessedTransfer: boolean
}

/**
 * The action for a row, or null while a person must decide (a possible
 * match, a transfer to an unknown account). A proposed match whose
 * transaction was deleted meanwhile becomes a new row; one a person picked
 * does not (confirm reports it instead). Duplicates and superseded rows are
 * never confirmed.
 */
export function confirmActionFor(row: ReviewRow): ConfirmAction | null {
  switch (row.resolution) {
    case 'new':
      return 'create'
    case 'auto_matched':
      if (row.matchTransactionId !== null) return 'match'
      return row.decided ? null : 'create'
    case 'transfer_leg':
      return row.transferAccountId === null ? null : 'transfer'
    case 'ignored':
      return 'ignore'
    default:
      return null
  }
}

/**
 * Rows the unattended backfill may confirm on its own: matches, known
 * transfers (not a guessed account), ignored checks and new rows that
 * already have a category. The rest stays staged for the review screen.
 */
export function isAutoConfirmable(row: ReviewRow): boolean {
  const action = confirmActionFor(row)
  if (action === null) return false
  if (action === 'transfer') return !row.guessedTransfer
  return action !== 'create' || row.categoryId !== null || row.hasSplits
}

export interface ReconciliationInput {
  /** Newest bank date of the export. */
  asOf: string | null
  /** Oldest bank date of the export. */
  dateFrom: string | null
  /** The bank's running balance on the newest row. */
  expectedBalanceCents: number | null
  /** Opening balance + every ledger row of the account up to `asOf`. */
  computedBalanceCents: number | null
  /** Derived from the oldest row on the account's first import, else null. */
  openingBalanceCents: number | null
}

export interface Reconciliation extends Omit<ReconciliationInput, 'dateFrom'> {
  /** expected - computed; null when either side is unknown. */
  differenceCents: number | null
  balanced: boolean | null
  /** When the balances differ: movements before this date are missing. */
  missingBefore: string | null
}

/** Bank balance vs ledger balance at the export's last date. */
export function reconcile(input: ReconciliationInput): Reconciliation {
  const comparable = input.expectedBalanceCents !== null && input.computedBalanceCents !== null
  const differenceCents = comparable
    ? input.expectedBalanceCents! - input.computedBalanceCents!
    : null
  const balanced = differenceCents === null ? null : differenceCents === 0
  return {
    asOf: input.asOf,
    expectedBalanceCents: input.expectedBalanceCents,
    computedBalanceCents: input.computedBalanceCents,
    differenceCents,
    balanced,
    openingBalanceCents: input.openingBalanceCents,
    missingBefore: balanced === false ? input.dateFrom : null,
  }
}
