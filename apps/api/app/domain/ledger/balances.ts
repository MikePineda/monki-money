import type { TransactionStatus } from '@monkimoney/shared'
import { sumCents } from '#domain/money/cents'

/**
 * Account balances. Every balance starts from the account's opening
 * balance and adds its ledger rows (transfer legs included: they move money
 * between accounts). `cleared` counts settled rows only; `available` also
 * counts pending ones, like a banking app.
 */

export type BalanceEntry = {
  amountCents: number
  status: TransactionStatus
}

export type AccountBalance = {
  clearedBalanceCents: number
  availableBalanceCents: number
}

export function accountBalance(openingCents: number, entries: BalanceEntry[]): AccountBalance {
  const cleared = entries.filter((entry) => entry.status === 'cleared')
  return {
    clearedBalanceCents: openingCents + sumCents(cleared.map((entry) => entry.amountCents)),
    availableBalanceCents: openingCents + sumCents(entries.map((entry) => entry.amountCents)),
  }
}

export type DatedEntry = {
  date: string
  amountCents: number
}

/** Balance at the end of `date` (entries on that day included). */
export function balanceAt(openingCents: number, entries: DatedEntry[], date: string): number {
  return (
    openingCents +
    sumCents(entries.filter((entry) => entry.date <= date).map((entry) => entry.amountCents))
  )
}

/**
 * Entries in ledger order (date, then id) with the balance after each one,
 * starting from the opening balance.
 */
export function runningBalance<Entry extends DatedEntry & { id: number }>(
  openingCents: number,
  entries: Entry[]
): Array<Entry & { balanceCents: number }> {
  let balanceCents = openingCents
  return [...entries]
    .sort((a, b) => (a.date === b.date ? a.id - b.id : a.date < b.date ? -1 : 1))
    .map((entry) => {
      balanceCents += entry.amountCents
      return { ...entry, balanceCents }
    })
}
