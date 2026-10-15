/**
 * The running `Balance` column of a bank export, rows newest first (the NAB
 * order): every balance equals the next (older) row's balance plus its own
 * amount. A break means a row is missing from the export.
 */
export interface BalanceRow {
  amountCents: number
  balanceCents: number | null
}

/** Indexes `i` where `balance[i] !== balance[i + 1] + amount[i]` (rows without a balance are skipped). */
export function balanceChainBreaks(rows: readonly BalanceRow[]): number[] {
  const breaks: number[] = []
  for (let index = 0; index < rows.length - 1; index++) {
    const newer = rows[index]
    const older = rows[index + 1]
    if (newer.balanceCents === null || older.balanceCents === null) continue
    if (newer.balanceCents !== older.balanceCents + newer.amountCents) breaks.push(index)
  }
  return breaks
}

/**
 * Balance before the oldest row (its balance minus its amount): the opening
 * balance of an account imported for the first time.
 */
export function openingBalanceCents(rows: readonly BalanceRow[]): number | null {
  const oldest = rows.at(-1)
  if (!oldest || oldest.balanceCents === null) return null
  return oldest.balanceCents - oldest.amountCents
}
