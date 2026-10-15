import type { EntryKind } from '@monkimoney/shared'
import type { Transaction } from '../../../../core/api/api-types'
import type { TransactionCreateInput, TransactionPatch } from '../../data-access/transactions.api'

/**
 * What the transaction form edits. Amounts are positive integer cents (the
 * kind gives the sign); `paidByUserId` null means the household (joint).
 */
export interface TransactionDraft {
  kind: EntryKind
  amountCents: number
  accountId: number | null
  paidByUserId: number | null
  categoryId: number | null
  date: string
  payee: string
  description: string
  isPrivate: boolean
  tags: string[]
}

/** Fields of the form that can carry an error under them. */
export type DraftField =
  | 'kind'
  | 'amount'
  | 'account'
  | 'person'
  | 'category'
  | 'date'
  | 'payee'
  | 'description'
  | 'tags'
  | 'form'

/** API field (from a 422) → the form field that shows it; anything else goes to the top. */
const FIELD_BY_API: Record<string, DraftField> = {
  kind: 'kind',
  amountCents: 'amount',
  accountId: 'account',
  paidByUserId: 'person',
  categoryId: 'category',
  splits: 'category',
  date: 'date',
  payee: 'payee',
  description: 'description',
  tags: 'tags',
}

/** Maps a 422's `{ field: message }` onto the form (`tags.0` → tags, unknown → form). */
export function draftErrors(
  apiFields: Record<string, string>
): Partial<Record<DraftField, string>> {
  const errors: Partial<Record<DraftField, string>> = {}
  for (const [field, message] of Object.entries(apiFields)) {
    const target = FIELD_BY_API[field.split('.')[0] ?? ''] ?? 'form'
    errors[target] ??= message
  }
  return errors
}

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

function text(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
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

/** A `POST /transactions` body (quick add and "duplicate" reuse it). */
export function draftToCreate(draft: TransactionDraft, clientId: string): TransactionCreateInput {
  if (draft.accountId === null) {
    throw new RangeError('A transaction needs an account')
  }
  return {
    clientId,
    accountId: draft.accountId,
    kind: draft.kind,
    date: draft.date,
    amountCents: draft.amountCents,
    categoryId: draft.categoryId,
    payee: text(draft.payee),
    description: text(draft.description),
    paidByUserId: draft.paidByUserId,
    isPrivate: draft.isPrivate,
    tags: [...draft.tags],
  }
}

/** Adds a tag typed by the user: trimmed, at most 40 characters, no duplicates, at most 20. */
export function addTag(tags: readonly string[], typed: string): string[] {
  const tag = typed.trim().slice(0, 40)
  if (!tag || tags.includes(tag) || tags.length >= 20) {
    return [...tags]
  }
  return [...tags, tag]
}
