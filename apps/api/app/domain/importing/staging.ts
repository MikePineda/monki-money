import { assignOccurrences, rowHash } from '#domain/importing/hash'
import {
  cardSuffix,
  effectiveDate,
  merchantFullKey,
  merchantKey,
  normalizeDescription,
} from '#domain/importing/normalize'
import { type PayerContext, suggestPaidBy } from '#domain/importing/paid_by'
import type { ParsedRow, StagedRow } from '#domain/importing/types'

export interface StagingOptions {
  /** Household account the rows belong to (resolved from `accountNumber` by the service). */
  accountId: number
  /** Today in the household timezone, `YYYY-MM-DD`. */
  today: string
  payers?: PayerContext
}

const NO_PAYERS: PayerContext = {
  accountOwnerUserId: null,
  cardOwners: new Map(),
  fallbackUserId: null,
}

/**
 * Parsed rows of one account -> staged rows: occurrence and hash,
 * effective date, normalized description, merchant keys, card, payer and
 * the future-date flag. Pass the rows in file order (occurrence depends on it).
 */
export function stageRows(rows: readonly ParsedRow[], options: StagingOptions): StagedRow[] {
  const occurrences = assignOccurrences(rows)
  const payers = options.payers ?? NO_PAYERS

  return rows.map((row, index) => {
    const occurrence = occurrences[index]
    const date = effectiveDate(row.details, row.bankDate)
    const description = normalizeDescription(row.details)
    const merchant = { nabMerchant: row.nabMerchant, description }
    const card = cardSuffix(row.details)

    return {
      ...row,
      accountId: options.accountId,
      occurrence,
      externalHash: rowHash({ ...row, occurrence }),
      date,
      descriptionNormalized: description,
      merchantKey: merchantKey(merchant),
      merchantFullKey: merchantFullKey(merchant),
      cardSuffix: card,
      isFutureDated: date > options.today || row.bankDate > options.today,
      suggestedPaidByUserId: suggestPaidBy(card, payers),
    }
  })
}
