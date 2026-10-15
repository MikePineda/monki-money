import type {
  ImportBatch,
  ImportBatchDetail,
  ImportRow,
  MerchantRule,
} from '../app/core/api/api-types'

/** Synthetic wire objects for the import screens (never real bank data). */
export function anImportBatch(overrides: Partial<ImportBatch> = {}): ImportBatch {
  return {
    id: 7,
    accountId: 1,
    status: 'staged',
    source: 'nab_csv',
    fileName: 'sample.csv',
    archived: false,
    dateFrom: '2026-09-01',
    dateTo: '2026-09-27',
    counts: {
      rows: 5,
      new: 2,
      autoMatched: 1,
      needsConfirmation: 1,
      duplicate: 1,
      transferLeg: 0,
      ignored: 0,
      superseded: 0,
    },
    reconciliation: {
      asOf: '2026-09-27',
      expectedBalanceCents: 723731,
      computedBalanceCents: 723731,
      differenceCents: 0,
      balanced: true,
      openingBalanceCents: null,
      missingBefore: null,
    },
    uploadedByUserId: 1,
    createdAt: '2026-10-01T00:00:00.000Z',
    completedAt: null,
    ...overrides,
  } as ImportBatch
}

export function anImportRow(overrides: Partial<ImportRow> = {}): ImportRow {
  return {
    id: 1,
    rowIndex: 1,
    bankDate: '2026-09-27',
    date: '2026-09-27',
    amountCents: -2500,
    balanceCents: 723731,
    transactionType: 'EFTPOS DEBIT',
    description: 'V1111 27/09 TICKETS*SAMPLE FEST SYDNEY',
    descriptionNormalized: 'tickets sample fest sydney',
    merchantKey: 'tickets sample fest',
    merchantFullKey: 'tickets sample fest sydney',
    nabCategory: 'Attractions & events',
    nabMerchant: 'TicketHub',
    isMasked: false,
    cardSuffix: '1111',
    isPending: false,
    isFutureDated: false,
    resolution: 'new',
    needsReview: false,
    reasons: [],
    match: null,
    suggestion: null,
    transfer: null,
    suggestedPaidByUserId: 1,
    decision: null,
    decidedAt: null,
    transactionId: null,
    confirmedAt: null,
    ...overrides,
  } as ImportRow
}

/** A trusted suggestion from the bank's category (shown as "Auto"). */
export function aTrustedSuggestion(categoryId: number) {
  return {
    source: 'nab_map' as const,
    categoryId,
    confidence: null,
    needsReview: false,
    ruleId: null,
    payee: null,
  }
}

/** A guess under review (shown as "Review"). */
export function aTentativeSuggestion(categoryId: number, confidence = 0.55) {
  return {
    source: 'llm' as const,
    categoryId,
    confidence,
    needsReview: true,
    ruleId: null,
    payee: null,
  }
}

/** A possible bank copy of an existing transaction. */
export function aMatchCandidate(transactionId = 900, amountCents = -2500) {
  return {
    transactionId,
    score: 65,
    upgradesPending: false,
    transaction: {
      date: '2026-09-27',
      amountCents,
      payee: 'Sample Fest',
      source: 'manual' as const,
      status: 'cleared' as const,
    },
  }
}

export function anImportDetail(
  rows: ImportRow[],
  overrides: Partial<ImportBatch> = {}
): ImportBatchDetail {
  return { ...anImportBatch(overrides), rows } as ImportBatchDetail
}

export function aRule(overrides: Partial<MerchantRule> = {}): MerchantRule {
  return {
    id: 1,
    matchType: 'merchant',
    pattern: 'corner grocer',
    categoryId: 20,
    transferAccountId: null,
    paidByUserId: null,
    payeeOverride: null,
    priority: 0,
    origin: 'learned',
    hitCount: 3,
    lastHitAt: '2026-10-01T00:00:00.000Z',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  } as MerchantRule
}
