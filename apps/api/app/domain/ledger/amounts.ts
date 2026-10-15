import type { EntryKind } from '@monkimoney/shared'

/**
 * People type amounts as positive numbers and pick "expense" or "income";
 * the ledger stores them signed: expenses negative, income positive.
 */
export function signedAmount(kind: EntryKind, amountCents: number): number {
  const absolute = Math.abs(amountCents)
  return kind === 'expense' ? -absolute : absolute
}

/**
 * Split lines are typed like their parent (positive = same direction); a
 * negative line goes the other way (an item returned on the same receipt).
 */
export function signedLines(kind: EntryKind, amountsCents: number[]): number[] {
  return amountsCents.map((amount) => (kind === 'expense' ? -amount : amount))
}
