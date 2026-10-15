import type {
  EntryKind,
  TransactionKind,
  TransactionSource,
  TransactionStatus,
} from '@monkimoney/shared'

/**
 * Inputs of the ledger services. Amounts arrive positive (`amountCents > 0`)
 * and the service applies the sign from `kind`: expenses are stored
 * negative, income positive. Dates are 'YYYY-MM-DD'.
 */

export interface SplitLineInput {
  categoryId: number
  /** Same direction as the parent when positive; negative goes the other way. */
  amountCents: number
  memo?: string | null
}

export interface CreateTransactionInput {
  /** Idempotency key of the client (uuid): a retry returns the first row. */
  clientId?: string
  accountId: number
  kind: EntryKind
  date: string
  amountCents: number
  /** Omit or null to leave it uncategorized. Not allowed with `splits`. */
  categoryId?: number | null
  splits?: SplitLineInput[]
  payee?: string | null
  description?: string | null
  /** null = joint. Omitted = account owner -> card suffix -> creator. */
  paidByUserId?: number | null
  status?: TransactionStatus
  isPrivate?: boolean
  tags?: string[]
  /*
   * Internal fields (imports, receipts, bots). The HTTP validators never
   * accept them.
   */
  source?: TransactionSource
  bankDate?: string | null
  rawDescription?: string | null
  cardSuffix?: string | null
  needsReview?: boolean
}

/** `POST /transactions/quick`: account, kind and date get defaults. */
export type QuickTransactionInput = Omit<CreateTransactionInput, 'accountId' | 'kind' | 'date'> & {
  accountId?: number
  kind?: EntryKind
  date?: string
}

export interface UpdateTransactionInput {
  accountId?: number
  kind?: EntryKind
  date?: string
  amountCents?: number
  categoryId?: number | null
  payee?: string | null
  description?: string | null
  paidByUserId?: number | null
  status?: TransactionStatus
  isPrivate?: boolean
  tags?: string[]
  needsReview?: boolean
  /**
   * With a new `categoryId` on an imported transaction: remember it for
   * this merchant (a learned merchant rule). Default false.
   */
  applyToFuture?: boolean
}

export interface UpdateSplitsInput {
  /** Empty = no longer split; then `categoryId` (optional) categorizes the whole. */
  splits: SplitLineInput[]
  categoryId?: number | null
}

export interface BulkCategorizeInput {
  ids: number[]
  /** null = back to uncategorized. */
  categoryId: number | null
}

export type TransactionSort = 'date' | '-date' | 'amount' | '-amount'

export interface TransactionFilters {
  /** 'YYYY-MM'; takes precedence over from/to. */
  month?: string
  from?: string
  to?: string
  accountId?: number[]
  categoryId?: number[]
  /** Only rows with nothing to report under (no category, not split, not a transfer). */
  uncategorized?: boolean
  paidByUserId?: number
  kind?: TransactionKind
  status?: TransactionStatus
  needsReview?: boolean
  /** Text search over payee, notes and the bank description. */
  q?: string
  page?: number
  perPage?: number
  sort?: TransactionSort
}

export interface CreateTransferInput {
  clientId?: string
  fromAccountId: number
  toAccountId: number
  date: string
  /** Positive; the outgoing leg gets the negative amount. */
  amountCents: number
  memo?: string | null
}

export type UpdateTransferInput = Partial<Omit<CreateTransferInput, 'clientId'>>
