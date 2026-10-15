/**
 * Rows of one upload grouped by `Account Number`, in first-seen order and
 * keeping file order inside each group: one import batch per account.
 */
export function groupByAccountNumber<T extends { accountNumber: string }>(
  rows: readonly T[]
): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const group = groups.get(row.accountNumber)
    if (group) group.push(row)
    else groups.set(row.accountNumber, [row])
  }
  return groups
}
