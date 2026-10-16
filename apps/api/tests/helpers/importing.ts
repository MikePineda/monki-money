import { readFileSync } from 'node:fs'
import type {
  CandidateTx,
  HouseholdAccount,
  MerchantRule,
  ParsedRow,
  StagedRow,
  TransferLeg,
} from '#domain/importing/types'

/**
 * Builders for the import pipeline's unit tests. Every value is synthetic;
 * fixtures under tests/fixtures/nab mimic the NAB export structure only.
 */

export const NAB_HEADER =
  'Date,Amount,Account Number,,Transaction Type,Transaction Details,Balance,Category,Merchant Name,Processed On'

/** The error `run` throws (null when it does not throw), to assert on its type and fields. */
export function thrown(run: () => unknown): unknown {
  try {
    run()
  } catch (error) {
    return error
  }
  return null
}

/** Raw bytes of a fixture in tests/fixtures/nab. */
export function nabFixture(name: string): Buffer {
  return readFileSync(new URL(`../fixtures/nab/${name}`, import.meta.url))
}

/** A NAB-shaped CSV from data lines (header included unless overridden). */
export function nabCsv(
  lines: string[],
  options: { header?: string; eol?: string; bom?: boolean } = {}
): Buffer {
  const eol = options.eol ?? '\r\n'
  const text = [options.header ?? NAB_HEADER, ...lines].join(eol) + eol
  return Buffer.from((options.bom ? '\uFEFF' : '') + text, 'utf8')
}

export function parsedRow(overrides: Partial<ParsedRow> = {}): ParsedRow {
  return {
    rowIndex: 0,
    accountNumber: '123456789',
    bankDate: '2026-09-21',
    amountCents: -4520,
    balanceCents: 100000,
    transactionType: 'MISCELLANEOUS DEBIT',
    detailsRaw: 'V2222 19/09 FRESHCO MARKET NORTHVALE 70000000601',
    details: 'V2222 19/09 FRESHCO MARKET NORTHVALE 70000000601',
    nabCategory: 'Groceries',
    nabMerchant: 'FreshCo Market (Northvale Village)',
    processedOn: '2026-09-21',
    isPending: false,
    raw: {},
    ...overrides,
  }
}

export function stagedRow(overrides: Partial<StagedRow> = {}): StagedRow {
  return {
    ...parsedRow(),
    accountId: 1,
    occurrence: 1,
    externalHash: 'hash-1',
    date: '2026-09-19',
    descriptionNormalized: 'FRESHCO MARKET NORTHVALE',
    merchantKey: 'freshco market',
    merchantFullKey: 'freshco market northvale village',
    cardSuffix: '2222',
    isFutureDated: false,
    suggestedPaidByUserId: null,
    ...overrides,
  }
}

export function candidate(overrides: Partial<CandidateTx> = {}): CandidateTx {
  return {
    id: 100,
    accountId: 1,
    amountCents: -4520,
    date: '2026-09-19',
    payee: 'FreshCo',
    description: null,
    cardSuffix: null,
    paidByUserId: null,
    source: 'manual',
    status: 'cleared',
    ...overrides,
  }
}

export function merchantRule(overrides: Partial<MerchantRule> = {}): MerchantRule {
  return {
    id: 1,
    matchType: 'merchant',
    pattern: 'freshco market northvale village',
    categoryId: 10,
    transferAccountId: null,
    paidByUserId: null,
    payeeOverride: null,
    priority: 0,
    createdBy: 'system',
    ...overrides,
  }
}

export function transferLeg(overrides: Partial<TransferLeg> = {}): TransferLeg {
  return {
    accountId: 2,
    amountCents: 75000,
    date: '2026-07-31',
    transactionId: 500,
    externalHash: null,
    ...overrides,
  }
}

export function householdAccount(overrides: Partial<HouseholdAccount> = {}): HouseholdAccount {
  return {
    id: 2,
    institution: 'NAB',
    kind: 'savings',
    isActive: true,
    ...overrides,
  }
}
