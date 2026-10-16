import { monthOf, type Month } from '#domain/calendar/month'
import type { Posting } from '#domain/ledger/posting'

/** How many expenses the Month view lists. */
export const TOP_EXPENSES = 5

/**
 * One of the month's largest expenses, as the postings describe it: a
 * whole transaction (the lines of a split one added back together), so the
 * caller can fetch its payee and notes by id.
 */
export type LargestExpense = {
  transactionId: number
  date: string
  /** Signed like the ledger: negative. */
  amountCents: number
  /** null when uncategorized, split, or hidden from the reader. */
  categoryId: number | null
  isSplit: boolean
  paidByUserId: number | null
  /** The reader may not see its details (a partner's private row). */
  hidden: boolean
}

/**
 * The `limit` largest expense rows (kind `expense`, adding up to money
 * out) dated in `month`, biggest first, ties to the latest row. Income,
 * refunds entered as income and transfer legs are not expenses. Pure: postings arrive already masked
 * for the reader (app/domain/ledger/privacy.ts).
 */
export function largestExpenses(
  postings: Posting[],
  month: Month,
  limit = TOP_EXPENSES
): LargestExpense[] {
  const byTransaction = new Map<number, LargestExpense>()
  for (const posting of postings) {
    if (posting.kind !== 'expense' || monthOf(posting.date) !== month) continue
    const existing = byTransaction.get(posting.transactionId)
    if (existing) {
      existing.amountCents += posting.amountCents
      continue
    }
    // A hidden row does not even say that it is split.
    const isSplit = posting.splitId !== null && !posting.hidden
    byTransaction.set(posting.transactionId, {
      transactionId: posting.transactionId,
      date: posting.date,
      amountCents: posting.amountCents,
      categoryId: isSplit ? null : posting.categoryId,
      isSplit,
      paidByUserId: posting.paidByUserId,
      hidden: posting.hidden,
    })
  }

  return (
    [...byTransaction.values()]
      // Only money that left: a positive "expense" (or one that nets to zero) is not spending.
      .filter((expense) => expense.amountCents < 0)
      .sort(
        (a, b) =>
          a.amountCents - b.amountCents ||
          (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) ||
          b.transactionId - a.transactionId
      )
      .slice(0, limit)
  )
}
