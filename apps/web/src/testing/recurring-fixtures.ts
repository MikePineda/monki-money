import type { RecurringItem } from '../app/core/api/api-types'

/** Weekly rent of $500 detected from the ledger, next due on 2026-10-20, category Rent (10). */
export function aRecurringItem(overrides: Partial<RecurringItem> = {}): RecurringItem {
  return {
    id: 1,
    payee: 'Harbour Lettings',
    merchantKey: 'harbour lettings',
    cadence: 'weekly',
    amountCents: 50_000,
    amountTolerancePct: 15,
    categoryId: 10,
    accountId: 1,
    paidByUserId: null,
    lastPaidDate: '2026-10-13',
    nextExpectedDate: '2026-10-20',
    status: 'active',
    pausedByDetection: false,
    source: 'detected',
    occurrences: 4,
    createdAt: '2026-10-16T00:00:00.000Z',
    updatedAt: '2026-10-16T00:00:00.000Z',
    ...overrides,
  }
}
