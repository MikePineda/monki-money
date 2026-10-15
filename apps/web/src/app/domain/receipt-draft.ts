/**
 * The receipt scanner's review, the pure part. Pure: no Angular.
 *
 * `POST /receipts/scan` reads a photo into a {@link ReceiptDraft}: the
 * merchant, date, total, a suggested category and the printed lines. The
 * person reviews it as an ordinary expense, or splits it by lines: each
 * line becomes a split line with its own category and the line's words as
 * the memo. Lines can be merged or dropped, and the last line always takes
 * whatever is left of the total (the split editor's rule, `split.ts`), so a
 * rounding or discount difference never blocks the save.
 */
import type { Cents } from './money'
import { isIsoDate, type IsoDate } from './month'
import { MAX_SPLIT_LINES, splitIssues, withRemainder, type SplitIssue } from './split'

/** One printed line of the receipt (amount in positive cents, as printed). */
export interface ReceiptItem {
  description: string
  amountCents: Cents
  quantity: number | null
}

/**
 * What `POST /receipts/scan` answers (docs/CONTRACTS.md, Receipts and
 * uploads). Any field but `items`, `confidence` and `key` is null when the
 * model could not read it; `categoryId` is the household's category for
 * `categorySlug`.
 */
export interface ReceiptDraft {
  merchant: string | null
  date: IsoDate | null
  totalCents: Cents | null
  currencyCode: string | null
  categoryId: number | null
  categorySlug: string | null
  items: ReceiptItem[]
  /** How sure the model is, 0..1. */
  confidence: number
  key: string
}

/** How much to trust the reading, worded on the review screen. */
export type ReceiptConfidence = 'high' | 'medium' | 'low'

/** The API's limit on a split line's memo. */
export const MAX_MEMO_LENGTH = 255

/** A receipt line in the review: an id for selection, the words, the amount, its category. */
export interface ReceiptLine {
  id: number
  description: string
  amountCents: Cents
  quantity: number | null
  categoryId: number | null
}

/** Why the lines cannot be saved as a split yet. */
export type LinesIssue = SplitIssue | 'tooManyLines'

/** One `splits[]` line of `POST /transactions`. */
export interface ReceiptSplit {
  categoryId: number
  amountCents: Cents
  memo: string | null
}

export function confidenceLevel(confidence: number): ReceiptConfidence {
  if (confidence >= 0.8) {
    return 'high'
  }
  return confidence >= 0.5 ? 'medium' : 'low'
}

/** The amount to open with: the printed total, else the sum of the lines (0 without any). */
export function receiptAmount(receipt: ReceiptDraft): Cents {
  if (receipt.totalCents !== null && receipt.totalCents > 0) {
    return receipt.totalCents
  }
  return Math.max(
    0,
    receipt.items.reduce((sum, item) => sum + item.amountCents, 0)
  )
}

/** The date to open with: the printed one, unless it is missing, unreadable or after today. */
export function receiptDate(receipt: ReceiptDraft, today: IsoDate): IsoDate {
  const printed = receipt.date
  return printed !== null && isIsoDate(printed) && printed <= today ? printed : today
}

/** The receipt's lines, numbered from 1, each with the receipt's category. */
export function linesFromReceipt(receipt: ReceiptDraft, categoryId: number | null): ReceiptLine[] {
  return receipt.items.map((item, index) => ({
    id: index + 1,
    description: item.description,
    amountCents: item.amountCents,
    quantity: item.quantity,
    categoryId,
  }))
}

/**
 * Folds the selected lines into the first of them (in list order): the
 * words joined with " + " (cut to the memo limit), the amounts added up,
 * the first line's category. Fewer than two selected lines change nothing.
 */
export function mergeLines(lines: readonly ReceiptLine[], ids: ReadonlySet<number>): ReceiptLine[] {
  const picked = lines.filter((item) => ids.has(item.id))
  const [first] = picked
  if (!first || picked.length < 2) {
    return [...lines]
  }
  const merged: ReceiptLine = {
    id: first.id,
    description: picked
      .map((item) => item.description.trim())
      .filter(Boolean)
      .join(' + ')
      .slice(0, MAX_MEMO_LENGTH),
    amountCents: picked.reduce((sum, item) => sum + item.amountCents, 0),
    quantity: null,
    categoryId: first.categoryId,
  }
  return lines
    .filter((item) => item === first || !ids.has(item.id))
    .map((item) => (item === first ? merged : item))
}

export function dropLines(lines: readonly ReceiptLine[], ids: ReadonlySet<number>): ReceiptLine[] {
  return lines.filter((item) => !ids.has(item.id))
}

/** Gives the selected lines a category. */
export function categorizeLines(
  lines: readonly ReceiptLine[],
  ids: ReadonlySet<number>,
  categoryId: number | null
): ReceiptLine[] {
  return lines.map((item) => (ids.has(item.id) ? { ...item, categoryId } : item))
}

/** The lines as they will be saved: the last one takes what is left of the total. */
export function settledLines(totalCents: Cents, lines: readonly ReceiptLine[]): ReceiptLine[] {
  const settled = withRemainder(totalCents, lines)
  return lines.map((item, index) => ({
    ...item,
    amountCents: settled[index]?.amountCents ?? item.amountCents,
  }))
}

/** Every rule the split by lines breaks (empty when it can be saved). */
export function linesIssues(totalCents: Cents, lines: readonly ReceiptLine[]): LinesIssue[] {
  const issues = new Set<LinesIssue>(splitIssues(totalCents, lines))
  const settled = settledLines(totalCents, lines)
  // A discount line (negative) cannot be a split line of an expense: merge or drop it.
  if (!issues.has('overTotal') && settled.some((item) => item.amountCents <= 0)) {
    issues.add('zeroLine')
  }
  if (lines.length > MAX_SPLIT_LINES) {
    issues.add('tooManyLines')
  }
  return [...issues]
}

/** The `splits` of the create body; throws while {@link linesIssues} reports a problem. */
export function receiptSplits(totalCents: Cents, lines: readonly ReceiptLine[]): ReceiptSplit[] {
  if (linesIssues(totalCents, lines).length > 0) {
    throw new RangeError('The receipt lines do not add up or miss a category')
  }
  return settledLines(totalCents, lines).map((item) => {
    const memo = item.description.trim().slice(0, MAX_MEMO_LENGTH)
    return {
      categoryId: item.categoryId as number,
      amountCents: item.amountCents,
      memo: memo || null,
    }
  })
}
