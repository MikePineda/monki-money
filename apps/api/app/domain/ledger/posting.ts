import type { CategoryGroupKind, TransactionKind, TransactionStatus } from '@monkimoney/shared'

/**
 * One line of the ledger as reports see it: a whole transaction, or one
 * line of a split transaction (the line's amount and category, the
 * parent's everything else). Produced only by
 * app/repositories/postings_repository.ts; every report is a pure function
 * over postings.
 */
export type Posting = {
  transactionId: number
  /** The split line, or null for a transaction that is not split. */
  splitId: number | null
  accountId: number
  /** Effective calendar date, 'YYYY-MM-DD'. */
  date: string
  /** Signed cents: negative leaves the account. */
  amountCents: number
  kind: TransactionKind
  status: TransactionStatus
  /** The line's category (split) or the transaction's; null = uncategorized. */
  categoryId: number | null
  groupId: number | null
  /** Kind of the category's group; decides income vs expense when categorized. */
  groupKind: CategoryGroupKind | null
  /** null = joint ("both of us"). */
  paidByUserId: number | null
  createdByUserId: number | null
  isPrivate: boolean
  /**
   * True when the reader may not see the details of this private posting:
   * its amount still counts, under the `private` bucket instead of its
   * category (see app/domain/ledger/privacy.ts).
   */
  hidden: boolean
}

/** Income or expense side of a posting; null for transfer legs. */
export type Flow = CategoryGroupKind

/**
 * Which side a posting counts on. Categorized postings follow their
 * group's kind, so a refund (positive amount) in an expense category
 * reduces that category's spending instead of counting as income.
 * Uncategorized ones follow the kind they were entered with.
 */
export function flowOf(posting: Posting): Flow | null {
  if (posting.kind === 'transfer') return null
  if (posting.groupKind) return posting.groupKind
  return posting.kind === 'income' ? 'income' : 'expense'
}

/** Amount as seen from its flow: spending is positive on the expense side. */
export function flowAmount(posting: Posting, flow: Flow): number {
  return flow === 'expense' ? -posting.amountCents : posting.amountCents
}
