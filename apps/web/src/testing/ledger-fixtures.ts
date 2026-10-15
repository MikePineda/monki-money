import type { Transaction } from '../app/core/api/api-types'
import type { CategoryTree } from '../app/domain/category-tree'

let nextId = 1000

/** A synthetic ledger row (an expense on account 1 paid by user 1, unless overridden). */
export function aTransaction(overrides: Partial<Transaction> = {}): Transaction {
  const id = overrides.id ?? nextId++
  return {
    id,
    accountId: 1,
    kind: 'expense',
    date: '2026-10-15',
    bankDate: null,
    amountCents: -4820,
    currencyCode: 'AUD',
    payee: 'Corner Grocer',
    description: null,
    rawDescription: null,
    categoryId: 11,
    isSplit: false,
    splits: [],
    transferId: null,
    paidByUserId: 1,
    status: 'cleared',
    source: 'manual',
    needsReview: false,
    cardSuffix: null,
    clientId: null,
    isPrivate: false,
    isMasked: false,
    tags: [],
    createdByUserId: 1,
    updatedByUserId: 1,
    createdAt: '2026-10-15T00:00:00.000Z',
    updatedAt: '2026-10-15T00:00:00.000Z',
    ...overrides,
  } as Transaction
}

/** The two legs of a transfer between accounts 1 (out) and 2 (in). */
export function aTransferPair(
  transferId: number,
  amountCents = 50000,
  date = '2026-10-14'
): [Transaction, Transaction] {
  return [
    aTransaction({
      kind: 'transfer',
      transferId,
      date,
      accountId: 1,
      amountCents: -amountCents,
      payee: null,
      categoryId: null,
      description: null,
    }),
    aTransaction({
      kind: 'transfer',
      transferId,
      date,
      accountId: 2,
      amountCents,
      payee: null,
      categoryId: null,
      description: null,
    }),
  ]
}

/** Housing (rent 10, utilities 11 with no seed icon), Food (groceries 20), Income (salary 30). */
export function aCategoryTree(): CategoryTree {
  return [
    {
      id: 1,
      name: 'Housing',
      slug: 'housing',
      kind: 'expense',
      isHidden: false,
      categories: [
        {
          id: 10,
          groupId: 1,
          name: 'Rent',
          slug: 'rent',
          icon: null,
          isHidden: false,
          isSystem: true,
        },
        {
          id: 11,
          groupId: 1,
          name: 'Utilities',
          slug: 'utilities',
          icon: null,
          isHidden: false,
          isSystem: true,
        },
      ],
    },
    {
      id: 2,
      name: 'Food',
      slug: 'food',
      kind: 'expense',
      isHidden: false,
      categories: [
        {
          id: 20,
          groupId: 2,
          name: 'Groceries',
          slug: 'groceries',
          icon: null,
          isHidden: false,
          isSystem: true,
        },
      ],
    },
    {
      id: 3,
      name: 'Income',
      slug: 'income',
      kind: 'income',
      isHidden: false,
      categories: [
        {
          id: 30,
          groupId: 3,
          name: 'Salary',
          slug: 'salary',
          icon: null,
          isHidden: false,
          isSystem: true,
        },
      ],
    },
  ]
}
