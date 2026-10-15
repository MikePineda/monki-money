import { type MatchableRow, matchRow } from '#domain/importing/matcher'
import type { CandidateTx, MatchResult } from '#domain/importing/types'

/**
 * Matches a whole batch so no ledger transaction is claimed twice (two
 * identical phone bills against one manual entry). Each round every open
 * row proposes its best candidate; a contested candidate goes to the
 * highest score (then the earlier row) and the losers retry without it.
 * Ends because every round claims at least one candidate or closes all rows.
 */
export function assignMatches(
  rows: readonly MatchableRow[],
  candidates: readonly CandidateTx[]
): MatchResult[] {
  const results: MatchResult[] = []
  const claimed = new Set<number>()
  let open = rows.map((_, index) => index)

  while (open.length > 0) {
    const available = candidates.filter((candidate) => !claimed.has(candidate.id))
    const proposals = new Map<number, number[]>()

    for (const index of open) {
      const result = matchRow(rows[index], available)
      results[index] = result
      if (result.transactionId !== null) {
        proposals.set(result.transactionId, [...(proposals.get(result.transactionId) ?? []), index])
      }
    }

    open = []
    for (const [transactionId, contenders] of proposals) {
      contenders.sort((a, b) => (results[b].score ?? 0) - (results[a].score ?? 0) || a - b)
      claimed.add(transactionId)
      open.push(...contenders.slice(1))
    }
    open.sort((a, b) => a - b)
  }

  return results
}
