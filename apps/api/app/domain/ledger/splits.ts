import { sumCents } from '#domain/money/cents'

/** One line of a split transaction, signed like its parent. */
export type SplitLine = {
  categoryId: number
  amountCents: number
}

export type SplitProblem = 'tooFewLines' | 'zeroLine' | 'sumMismatch'

export type SplitValidation =
  | { valid: true }
  | {
      valid: false
      problem: SplitProblem
      /** Parent minus lines: what is still to assign, signed like the parent (0 unless the sum is off). */
      differenceCents: number
    }

/**
 * Invariant of split transactions (Actual Budget model): at least two
 * lines, none of them zero, and their sum equals the parent amount
 * exactly. The parent then has no category of its own.
 */
export function validateSplits(parentAmountCents: number, lines: SplitLine[]): SplitValidation {
  if (lines.length < 2) return { valid: false, problem: 'tooFewLines', differenceCents: 0 }
  if (lines.some((line) => line.amountCents === 0)) {
    return { valid: false, problem: 'zeroLine', differenceCents: 0 }
  }

  const differenceCents = parentAmountCents - sumCents(lines.map((line) => line.amountCents))
  if (differenceCents !== 0) return { valid: false, problem: 'sumMismatch', differenceCents }

  return { valid: true }
}
