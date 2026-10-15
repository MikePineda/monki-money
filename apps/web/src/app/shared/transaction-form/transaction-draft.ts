import type { EntryKind } from '@monkimoney/shared'

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
