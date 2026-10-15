import type ImportRow from '#models/import_row'
import type { ImportSplitLine } from '@monkimoney/shared'
import type { ReviewRow } from '#domain/importing/review'

/** An import row's proposal with the person's decision applied (absent keys keep the proposal). */
export interface EffectiveRow {
  categoryId: number | null
  transferAccountId: number | null
  matchTransactionId: number | null
  paidByUserId: number | null
  payee: string | null
  splits: ImportSplitLine[]
  learnRule: boolean
  /** The person set the category or the split lines. */
  categoryDecided: boolean
  /** The person changed anything at all. */
  decided: boolean
}

export function effectiveRow(row: ImportRow): EffectiveRow {
  const decision = row.decision ?? {}
  const pick = <Key extends keyof typeof decision, Fallback>(key: Key, fallback: Fallback) =>
    Object.hasOwn(decision, key)
      ? (decision[key] as Exclude<(typeof decision)[Key], undefined>)
      : fallback
  const splits = decision.splits ?? []

  return {
    categoryId: pick('categoryId', row.suggestedCategoryId),
    transferAccountId: pick('transferAccountId', row.suggestedTransferAccountId),
    matchTransactionId: pick('matchTransactionId', row.matchTransactionId),
    paidByUserId: pick('paidByUserId', row.suggestedPaidByUserId),
    payee: pick('payee', row.suggestedPayee),
    splits,
    learnRule: decision.learnRule !== false,
    categoryDecided: Object.hasOwn(decision, 'categoryId') || splits.length > 0,
    decided: row.decidedAt !== null,
  }
}

/** The row as the pure review step (app/domain/importing/review.ts) sees it. */
export function reviewRowOf(row: ImportRow, effective = effectiveRow(row)): ReviewRow {
  return {
    resolution: row.resolution,
    decided: effective.decided,
    matchTransactionId: effective.matchTransactionId,
    transferAccountId: effective.transferAccountId,
    categoryId: effective.categoryId,
    hasSplits: effective.splits.length > 0,
  }
}
