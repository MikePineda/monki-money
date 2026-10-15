/**
 * Wire shapes of the bank import review that both apps store or send.
 * Amounts are integer cents.
 */

/** A split line decided for an imported row (same rules as a transaction's split). */
export interface ImportSplitLine {
  categoryId: number
  /** Positive = same direction as the row; negative goes the other way. */
  amountCents: number
  memo?: string | null
}

/**
 * What a person changed on an imported row before confirming
 * (`PATCH /imports/:id/rows/:rowId`, stored in `import_rows.decision`).
 * A key that is absent keeps the importer's proposal; `null` clears it
 * (for `paidByUserId`, null means "both of us").
 */
export interface ImportRowDecision {
  categoryId?: number | null
  transferAccountId?: number | null
  matchTransactionId?: number | null
  paidByUserId?: number | null
  payee?: string | null
  /** At least two lines that add up to the row's amount; empty = not split. */
  splits?: ImportSplitLine[]
  /** False = do not learn a merchant rule from this row. */
  learnRule?: boolean
}
