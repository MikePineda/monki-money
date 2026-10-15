import { addDays, daysBetween } from '#domain/importing/iso_days'
import { tokenSimilarity } from '#domain/importing/similarity'
import type { CandidateTx, MatchResult, ScoredCandidate, StagedRow } from '#domain/importing/types'

/**
 * Is an imported row the bank's copy of a transaction already in the
 * ledger (typed by hand, scanned from a receipt, or imported while still
 * pending)? Pure scoring over candidates the import service loaded.
 *
 * Score (0-100): date +40 exact / +30 within 2 days / +15 within 3 days
 * (distance to the purchase or the posting date, whichever is closer);
 * payee vs bank text similarity up to +40; same card or payer +5; only
 * candidate +15. Tiers: >= 80 auto_matched, 50-79 needs_confirmation,
 * < 50 new; two candidates >= 80 are ambiguous (needs_confirmation).
 */

export const MATCH_POINTS = {
  exactDate: 40,
  withinTwoDays: 30,
  withinThreeDays: 15,
  similarity: 40,
  samePerson: 5,
  uniqueCandidate: 15,
} as const

export const AUTO_MATCH_SCORE = 80
export const CONFIRM_MATCH_SCORE = 50

/** Candidate dates go from 3 days before the purchase to 1 day after the posting. */
export const DAYS_BEFORE_PURCHASE = 3
export const DAYS_AFTER_POSTING = 1

export type MatchableRow = Pick<
  StagedRow,
  | 'accountId'
  | 'amountCents'
  | 'date'
  | 'bankDate'
  | 'descriptionNormalized'
  | 'nabMerchant'
  | 'cardSuffix'
  | 'suggestedPaidByUserId'
>

/**
 * Same account, same amount, inside the date window, and either an entry
 * made outside the importer or an import that was still pending. Cleared
 * imports never match: re-imports are caught by the hash instead.
 */
export function isMatchCandidate(row: MatchableRow, candidate: CandidateTx): boolean {
  return (
    candidate.accountId === row.accountId &&
    candidate.amountCents === row.amountCents &&
    candidate.date >= addDays(row.date, -DAYS_BEFORE_PURCHASE) &&
    candidate.date <= addDays(row.bankDate, DAYS_AFTER_POSTING) &&
    (candidate.source !== 'import' || candidate.status === 'pending')
  )
}

function datePoints(row: MatchableRow, candidate: CandidateTx): number {
  const distance = Math.min(
    Math.abs(daysBetween(row.date, candidate.date)),
    Math.abs(daysBetween(row.bankDate, candidate.date))
  )
  if (distance === 0) return MATCH_POINTS.exactDate
  if (distance <= 2) return MATCH_POINTS.withinTwoDays
  if (distance <= 3) return MATCH_POINTS.withinThreeDays
  return 0
}

function similarityPoints(row: MatchableRow, candidate: CandidateTx): number {
  const bankText = `${row.nabMerchant ?? ''} ${row.descriptionNormalized}`
  const similarity = Math.max(
    tokenSimilarity(candidate.payee ?? '', bankText),
    tokenSimilarity(candidate.description ?? '', bankText)
  )
  return Math.round(MATCH_POINTS.similarity * similarity)
}

function samePersonPoints(row: MatchableRow, candidate: CandidateTx): number {
  const sameCard = row.cardSuffix !== null && candidate.cardSuffix === row.cardSuffix
  const samePayer =
    row.suggestedPaidByUserId !== null && candidate.paidByUserId === row.suggestedPaidByUserId
  return sameCard || samePayer ? MATCH_POINTS.samePerson : 0
}

function scoreCandidate(
  row: MatchableRow,
  candidate: CandidateTx,
  unique: boolean
): ScoredCandidate {
  const points = {
    date: datePoints(row, candidate),
    similarity: similarityPoints(row, candidate),
    samePerson: samePersonPoints(row, candidate),
    unique: unique ? MATCH_POINTS.uniqueCandidate : 0,
  }
  return {
    transactionId: candidate.id,
    score: points.date + points.similarity + points.samePerson + points.unique,
    points,
  }
}

/** Best match for one row among `candidates` (filtered with `isMatchCandidate`). */
export function matchRow(row: MatchableRow, candidates: readonly CandidateTx[]): MatchResult {
  const eligible = candidates.filter((candidate) => isMatchCandidate(row, candidate))
  const scored = eligible
    .map((candidate) => scoreCandidate(row, candidate, eligible.length === 1))
    .sort((a, b) => b.score - a.score || a.transactionId - b.transactionId)

  const [best, runnerUp] = scored
  if (!best || best.score < CONFIRM_MATCH_SCORE) {
    return {
      resolution: 'new',
      transactionId: null,
      score: null,
      upgradesPending: false,
      candidates: scored,
    }
  }

  const ambiguous = runnerUp !== undefined && runnerUp.score >= AUTO_MATCH_SCORE
  const resolution =
    best.score >= AUTO_MATCH_SCORE && !ambiguous ? 'auto_matched' : 'needs_confirmation'
  const bestCandidate = eligible.find((candidate) => candidate.id === best.transactionId)

  return {
    resolution,
    transactionId: best.transactionId,
    score: best.score,
    upgradesPending: bestCandidate?.source === 'import',
    candidates: scored,
  }
}
