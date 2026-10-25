import type { EntryKind } from '@monkimoney/shared'
import type { TransactionPayload, TransferPayload } from '../../domain/outbox'
import type { TransferDraft } from './transfer-form.component'

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

/** Adds a tag typed by the user: trimmed, at most 40 characters, no duplicates, at most 20. */
export function addTag(tags: readonly string[], typed: string): string[] {
  const tag = typed.trim().slice(0, 40)
  if (!tag || tags.includes(tag) || tags.length >= 20) {
    return [...tags]
  }
  return [...tags, tag]
}

/** Free text as the API stores it: trimmed, and null when blank. */
export function blankToNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * The create body of an expense or income (`POST /transactions[/quick]`,
 * also what the offline outbox keeps): amount positive, the kind gives the
 * sign, blank text is null. Quick add and "duplicate" both build it here.
 */
export function draftToCreate(draft: TransactionDraft, clientId: string): TransactionPayload {
  if (draft.accountId === null) {
    throw new RangeError('A transaction needs an account')
  }
  return {
    clientId,
    kind: draft.kind,
    accountId: draft.accountId,
    date: draft.date,
    amountCents: draft.amountCents,
    categoryId: draft.categoryId,
    payee: blankToNull(draft.payee),
    description: blankToNull(draft.description),
    paidByUserId: draft.paidByUserId,
    isPrivate: draft.isPrivate,
    tags: [...draft.tags],
  }
}

/** The form's draft back from a create body (editing a queued entry). */
export function draftFromCreate(body: TransactionPayload): TransactionDraft {
  return {
    kind: body.kind,
    amountCents: body.amountCents,
    accountId: body.accountId,
    paidByUserId: body.paidByUserId,
    categoryId: body.categoryId,
    date: body.date,
    payee: body.payee ?? '',
    description: body.description ?? '',
    isPrivate: body.isPrivate,
    tags: [...body.tags],
  }
}

/** The create body of a transfer (`POST /transfers`). */
export function transferToCreate(draft: TransferDraft, clientId: string): TransferPayload {
  if (draft.fromAccountId === null || draft.toAccountId === null) {
    throw new RangeError('A transfer needs two accounts')
  }
  return {
    clientId,
    fromAccountId: draft.fromAccountId,
    toAccountId: draft.toAccountId,
    date: draft.date,
    amountCents: draft.amountCents,
    memo: blankToNull(draft.memo),
    tags: [...draft.tags],
  }
}

/** The transfer form's draft back from a create body. */
export function transferFromCreate(body: TransferPayload): TransferDraft {
  return {
    fromAccountId: body.fromAccountId,
    toAccountId: body.toAccountId,
    amountCents: body.amountCents,
    date: body.date,
    memo: body.memo ?? '',
    tags: [...body.tags],
  }
}
