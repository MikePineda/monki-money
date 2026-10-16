import type { Payslip } from '../app/core/api/api-types'
import type { CategoryTree } from '../app/domain/category-tree'
import type { PayoutCandidate } from '../app/domain/payslip-draft'
import { aCategoryTree } from './ledger-fixtures'

/**
 * A synthetic payslip on account 3 (a wallet): 5,000.00 gross (salary,
 * category 30), 1,250.00 tax (category 31) and 50.00 fee (category 32),
 * 3,700.00 sent to account 1 by transfer 70, earned by user 1.
 */
export function aPayslip(overrides: Partial<Payslip> = {}): Payslip {
  return {
    id: 1,
    accountId: 3,
    userId: 1,
    date: '2026-08-31',
    grossCents: 500_000,
    netCents: 370_000,
    deductionsCents: 130_000,
    memo: null,
    transferId: 70,
    transfer: {
      id: 70,
      date: '2026-08-31',
      amountCents: 370_000,
      fromAccountId: 3,
      toAccountId: 1,
    },
    lines: [
      {
        transactionId: 100,
        kind: 'income',
        categoryId: 30,
        amountCents: 500_000,
        memo: null,
        isMasked: false,
      },
      {
        transactionId: 101,
        kind: 'expense',
        categoryId: 31,
        amountCents: -125_000,
        memo: null,
        isMasked: false,
      },
      {
        transactionId: 102,
        kind: 'expense',
        categoryId: 32,
        amountCents: -5_000,
        memo: null,
        isMasked: false,
      },
    ],
    createdByUserId: 1,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  } as Payslip
}

/** A transfer out of account 3 waiting for its payslip. */
export function aPayoutCandidate(overrides: Partial<PayoutCandidate> = {}): PayoutCandidate {
  return {
    transferId: 70,
    date: '2026-08-31',
    amountCents: 370_000,
    toAccountId: 1,
    memo: null,
    ...overrides,
  }
}

/** The usual tree plus a Finance group with Taxes (31) and Fees (32), the payslip defaults. */
export function aPayslipCategoryTree(): CategoryTree {
  return [
    ...aCategoryTree(),
    {
      id: 4,
      name: 'Finance',
      slug: 'finance-other',
      kind: 'expense',
      isHidden: false,
      categories: [
        {
          id: 31,
          groupId: 4,
          name: 'Taxes',
          slug: 'taxes',
          icon: null,
          isHidden: false,
          isSystem: true,
        },
        {
          id: 32,
          groupId: 4,
          name: 'Bank & service fees',
          slug: 'bank-fees',
          icon: null,
          isHidden: false,
          isSystem: true,
        },
      ],
    },
  ]
}
