import { assignMatches } from '#domain/importing/match_assignment'
import {
  type CategorySuggester,
  suggestionInputFor,
} from '#domain/importing/suggesters/category_suggester'
import { detectTransfer } from '#domain/importing/transfer_detector'
import type { ResolvedRow, ResolverContext, StagedRow, TransferLeg } from '#domain/importing/types'

/**
 * Chain of responsibility over plain objects that decides what each staged
 * row of a batch is before the user reviews it:
 *
 *   DuplicateStep -> ZeroAmountStep -> TransferStep -> MatchStep -> SuggestCategoryStep
 *
 * Steps work on the whole batch (matches and transfer legs are claimed once
 * per batch; the LLM link classifies in bulk) and skip settled rows. No
 * step touches the database: the import service loads `ResolverContext`
 * and stores the result in `import_rows`.
 */
export interface ResolverStep {
  run(
    rows: readonly ResolvedRow[],
    context: ResolverContext
  ): Promise<ResolvedRow[]> | ResolvedRow[]
}

/** Starting point: a new row, flagged for review when dated in the future. */
export function draftFor(row: StagedRow): ResolvedRow {
  return {
    row,
    resolution: 'new',
    matchTransactionId: null,
    matchScore: null,
    upgradesPendingTransaction: false,
    transfer: null,
    suggestion: null,
    paidByUserId: row.suggestedPaidByUserId,
    needsReview: row.isFutureDated,
    reasons: row.isFutureDated ? ['future_date'] : [],
    settled: false,
  }
}

/** Hash already stored for the account (any resolution, ignored included): never imported twice. */
export class DuplicateStep implements ResolverStep {
  run(rows: readonly ResolvedRow[], context: ResolverContext): ResolvedRow[] {
    return rows.map((resolved) =>
      resolved.settled || !context.existingHashes.has(resolved.row.externalHash)
        ? resolved
        : {
            ...resolved,
            resolution: 'duplicate',
            needsReview: false,
            reasons: ['duplicate_hash'],
            settled: true,
          }
    )
  }
}

/** A zero amount (card checks, cancelled holds) moves no money: ignored, the user may revive it. */
export class ZeroAmountStep implements ResolverStep {
  run(rows: readonly ResolvedRow[]): ResolvedRow[] {
    return rows.map((resolved) =>
      resolved.settled || resolved.row.amountCents !== 0
        ? resolved
        : {
            ...resolved,
            resolution: 'ignored',
            needsReview: false,
            reasons: ['zero_amount'],
            settled: true,
          }
    )
  }
}

/**
 * Internal transfers become `transfer_leg` when the other account is known
 * (opposite leg, rule, or the only possible account), else
 * `needs_confirmation` so the user picks it. A guessed account (the only
 * possible one) is flagged for review and never auto-confirmed.
 * Each opposite leg is claimed by one row only.
 */
export class TransferStep implements ResolverStep {
  run(rows: readonly ResolvedRow[], context: ResolverContext): ResolvedRow[] {
    const claimed = new Set<TransferLeg>()
    return rows.map((resolved) => {
      if (resolved.settled) return resolved
      const legs = context.transferLegs.filter((leg) => !claimed.has(leg))
      const transfer = detectTransfer(resolved.row, {
        rules: context.rules,
        legs,
        accounts: context.accounts,
      })
      if (!transfer) return resolved
      if (transfer.oppositeLeg) claimed.add(transfer.oppositeLeg)

      const known = transfer.counterpartAccountId !== null
      const reason = !known
        ? 'transfer_destination_unknown'
        : transfer.guessed
          ? 'transfer_destination_guessed'
          : null
      return {
        ...resolved,
        transfer,
        resolution: known ? 'transfer_leg' : 'needs_confirmation',
        needsReview: resolved.needsReview || (known && transfer.guessed),
        reasons: reason ? [...resolved.reasons, reason] : resolved.reasons,
      }
    })
  }
}

/**
 * The bank's copy of something already in the ledger: `auto_matched` or
 * `needs_confirmation` (future-dated rows are never auto-matched). A match
 * against a pending import means "upgrade it and supersede its old row".
 * No match leaves the previous resolution (new or transfer) untouched.
 */
export class MatchStep implements ResolverStep {
  run(rows: readonly ResolvedRow[], context: ResolverContext): ResolvedRow[] {
    const open = rows.flatMap((resolved, index) => (resolved.settled ? [] : [index]))
    const results = assignMatches(
      open.map((index) => rows[index].row),
      context.candidates
    )

    const next = [...rows]
    open.forEach((rowIndex, position) => {
      const result = results[position]
      const resolved = rows[rowIndex]
      if (result.resolution === 'new') return

      const auto = result.resolution === 'auto_matched' && !resolved.row.isFutureDated
      next[rowIndex] = {
        ...resolved,
        resolution: auto ? 'auto_matched' : 'needs_confirmation',
        matchTransactionId: result.transactionId,
        matchScore: result.score,
        upgradesPendingTransaction: result.upgradesPending,
        reasons: auto ? resolved.reasons : [...resolved.reasons, 'possible_match'],
      }
    })
    return next
  }
}

/**
 * Category (and payee/payer from a rule) for rows that will become new
 * spending or income: not settled, not transfers, not auto-matched. A
 * suggestion under review, or none at all, flags the row for review.
 */
export class SuggestCategoryStep implements ResolverStep {
  constructor(private readonly suggester: CategorySuggester) {}

  async run(rows: readonly ResolvedRow[]): Promise<ResolvedRow[]> {
    const targets = rows.flatMap((resolved, index) =>
      resolved.settled || resolved.transfer !== null || resolved.resolution === 'auto_matched'
        ? []
        : [index]
    )
    const next = [...rows]
    if (targets.length === 0) return next

    const answers = await this.suggester.suggest(
      targets.map((index) => suggestionInputFor(rows[index].row))
    )
    targets.forEach((rowIndex, position) => {
      const suggestion = answers[position] ?? null
      const resolved = rows[rowIndex]
      const unsure = suggestion === null || suggestion.needsReview
      next[rowIndex] = {
        ...resolved,
        suggestion,
        paidByUserId: suggestion?.paidByUserId ?? resolved.paidByUserId,
        needsReview: resolved.needsReview || unsure,
        reasons: unsure ? [...resolved.reasons, 'category_needs_review'] : resolved.reasons,
      }
    })
    return next
  }
}

/** The standard chain; the suggester decides which suggestion links run (LLM only when classifying). */
export function defaultResolverSteps(suggester: CategorySuggester): ResolverStep[] {
  return [
    new DuplicateStep(),
    new ZeroAmountStep(),
    new TransferStep(),
    new MatchStep(),
    new SuggestCategoryStep(suggester),
  ]
}

/** Runs the steps over a batch of staged rows (one account, file order). */
export async function resolveRows(
  rows: readonly StagedRow[],
  context: ResolverContext,
  steps: readonly ResolverStep[]
): Promise<ResolvedRow[]> {
  let resolved = rows.map(draftFor)
  for (const step of steps) {
    resolved = await step.run(resolved, context)
  }
  return resolved
}
