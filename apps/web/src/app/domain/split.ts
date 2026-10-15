/**
 * Split editor math. Pure: no Angular. A split transaction spreads its
 * amount over two or more categories; the lines must add up to the amount
 * exactly (the API answers 422 `splits`/`sumMismatch` otherwise).
 *
 * The editor works with magnitudes (positive cents, typed on the keypad)
 * and the last line is never typed: it always receives the remainder, so
 * the sum rule holds by construction unless the other lines pass the total.
 */
import type { Cents } from './money'

/** One editable line: a category (null until chosen) and a positive amount. */
export interface SplitDraftLine {
  categoryId: number | null
  amountCents: Cents
}

/** Why a split cannot be saved yet. */
export type SplitIssue = 'tooFewLines' | 'missingCategory' | 'zeroLine' | 'overTotal'

/** The API's limit on split lines. */
export const MAX_SPLIT_LINES = 50
export const MIN_SPLIT_LINES = 2

/** What the last line receives: the total minus every other line (negative when over). */
export function splitLeftCents(totalCents: Cents, lines: readonly SplitDraftLine[]): Cents {
  const typed = lines.slice(0, -1).reduce((sum, item) => sum + item.amountCents, 0)
  return Math.abs(totalCents) - typed
}

/** The lines with the remainder written into the last one (a new array). */
export function withRemainder(
  totalCents: Cents,
  lines: readonly SplitDraftLine[]
): SplitDraftLine[] {
  if (lines.length === 0) {
    return []
  }
  const left = splitLeftCents(totalCents, lines)
  return lines.map((item, index) =>
    index === lines.length - 1 ? { ...item, amountCents: left } : { ...item }
  )
}

/** Every rule the split breaks, checked with the remainder applied. */
export function splitIssues(totalCents: Cents, lines: readonly SplitDraftLine[]): SplitIssue[] {
  const issues: SplitIssue[] = []
  const filled = withRemainder(totalCents, lines)
  if (filled.length < MIN_SPLIT_LINES) {
    issues.push('tooFewLines')
  }
  if (filled.some((item) => item.categoryId === null)) {
    issues.push('missingCategory')
  }
  if (splitLeftCents(totalCents, lines) < 0) {
    issues.push('overTotal')
  } else if (filled.some((item) => item.amountCents === 0)) {
    issues.push('zeroLine')
  }
  return issues
}

export function canSaveSplit(totalCents: Cents, lines: readonly SplitDraftLine[]): boolean {
  return splitIssues(totalCents, lines).length === 0
}

interface SplittableTransaction {
  amountCents: Cents
  categoryId: number | null
  splits: readonly { categoryId: number; amountCents: Cents }[]
}

/**
 * Where the editor starts: an existing split loads its lines (as magnitudes
 * in the parent's direction); a single transaction starts with its own
 * category on an empty first line and a second line holding the whole amount.
 */
export function initialSplitLines(transaction: SplittableTransaction): SplitDraftLine[] {
  const direction = transaction.amountCents < 0 ? -1 : 1
  if (transaction.splits.length >= MIN_SPLIT_LINES) {
    return transaction.splits.map((item) => ({
      categoryId: item.categoryId,
      amountCents: item.amountCents * direction,
    }))
  }
  return withRemainder(transaction.amountCents, [
    { categoryId: transaction.categoryId, amountCents: 0 },
    { categoryId: null, amountCents: 0 },
  ])
}

/** Appends an empty line, which becomes the remainder line. */
export function addSplitLine(
  totalCents: Cents,
  lines: readonly SplitDraftLine[]
): SplitDraftLine[] {
  if (lines.length >= MAX_SPLIT_LINES) {
    return [...lines]
  }
  return withRemainder(totalCents, [...lines, { categoryId: null, amountCents: 0 }])
}

/** Removes a line (never below two) and recomputes the remainder. */
export function removeSplitLine(
  totalCents: Cents,
  lines: readonly SplitDraftLine[],
  index: number
): SplitDraftLine[] {
  if (lines.length <= MIN_SPLIT_LINES || index < 0 || index >= lines.length) {
    return [...lines]
  }
  return withRemainder(
    totalCents,
    lines.filter((_, position) => position !== index)
  )
}

/** The `PUT /transactions/:id/splits` lines: positive amounts, remainder applied. */
export function toSplitPayload(
  totalCents: Cents,
  lines: readonly SplitDraftLine[]
): { categoryId: number; amountCents: Cents }[] {
  if (!canSaveSplit(totalCents, lines)) {
    throw new RangeError('The split does not add up or misses a category')
  }
  return withRemainder(totalCents, lines).map((item) => ({
    categoryId: item.categoryId as number,
    amountCents: item.amountCents,
  }))
}
