import type { Transaction } from '../../../core/api/api-types'
import {
  blankToNull as text,
  type TransactionDraft,
} from '../../../shared/transaction-form/transaction-draft'
import type { TransactionPatch } from '../data-access/transactions.api'

/**
 * The transaction form's draft (shared/transaction-form) to and from this
 * feature's API bodies: a row to edit and a PATCH of what changed (creates
 * are built by `draftToCreate` in shared/transaction-form).
 */

export function draftFromTransaction(row: Transaction): TransactionDraft {
  return {
    kind: row.kind === 'income' ? 'income' : 'expense',
    amountCents: Math.abs(row.amountCents),
    accountId: row.accountId,
    paidByUserId: row.paidByUserId,
    categoryId: row.categoryId,
    date: row.date,
    payee: row.payee ?? '',
    description: row.description ?? '',
    isPrivate: row.isPrivate,
    tags: [...row.tags],
  }
}

function sameTags(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((tag, index) => tag === b[index])
}

/**
 * Only what changed, as a `PATCH /transactions/:id` body. A split row never
 * sends its amount or category (the split owns them).
 */
export function draftToPatch(row: Transaction, draft: TransactionDraft): TransactionPatch {
  const before = draftFromTransaction(row)
  const patch: TransactionPatch = {}
  if (draft.kind !== before.kind) patch.kind = draft.kind
  if (!row.isSplit && draft.amountCents !== before.amountCents) {
    patch.amountCents = draft.amountCents
  }
  if (draft.accountId !== before.accountId && draft.accountId !== null) {
    patch.accountId = draft.accountId
  }
  if (draft.paidByUserId !== before.paidByUserId) patch.paidByUserId = draft.paidByUserId
  if (!row.isSplit && draft.categoryId !== before.categoryId) patch.categoryId = draft.categoryId
  if (draft.date !== before.date) patch.date = draft.date
  if (text(draft.payee) !== text(before.payee)) patch.payee = text(draft.payee)
  if (text(draft.description) !== text(before.description)) {
    patch.description = text(draft.description)
  }
  if (draft.isPrivate !== before.isPrivate) patch.isPrivate = draft.isPrivate
  if (!sameTags(draft.tags, before.tags)) patch.tags = [...draft.tags]
  return patch
}
