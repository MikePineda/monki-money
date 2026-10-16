import type { Posting } from '#domain/ledger/posting'

let nextTransactionId = 1

/**
 * A synthetic posting for unit tests: a cleared 10.00 expense on
 * 2026-10-10 in category 10 (group 1, expense), paid by user 1.
 */
export function posting(overrides: Partial<Posting> = {}): Posting {
  return {
    transactionId: nextTransactionId++,
    splitId: null,
    accountId: 1,
    accountKind: 'transaction',
    date: '2026-10-10',
    amountCents: -1_000,
    kind: 'expense',
    status: 'cleared',
    categoryId: 10,
    groupId: 1,
    groupKind: 'expense',
    paidByUserId: 1,
    createdByUserId: 1,
    isPrivate: false,
    tags: [],
    hidden: false,
    ...overrides,
  }
}

/** Both legs of a transfer between two accounts (never income or expense). */
export function transferLegs(amountCents: number, overrides: Partial<Posting> = {}): Posting[] {
  const shared = {
    kind: 'transfer' as const,
    categoryId: null,
    groupId: null,
    groupKind: null,
    ...overrides,
  }
  return [
    posting({ ...shared, accountId: 1, amountCents: -amountCents }),
    posting({ ...shared, accountId: 2, amountCents }),
  ]
}
