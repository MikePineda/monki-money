/**
 * Shaping the ledger for the transactions list. Pure: no Angular.
 * Rows arrive newest first from the API; the list groups them by day,
 * shows a transfer as one item (its two legs merged), and gives each day a
 * subtotal of what came in and went out (transfers move money between the
 * household's own accounts, so they never count).
 */
import type { Cents } from './money'
import type { IsoDate } from './month'
import { normalizeForSearch } from './text'

/** The ledger fields this module reads. */
export interface LedgerRow {
  id: number
  kind: 'expense' | 'income' | 'transfer'
  date: IsoDate
  amountCents: Cents
  transferId: number | null
  accountId: number
}

export type ListItem<T extends LedgerRow> =
  | { type: 'entry'; key: string; row: T }
  | { type: 'transfer'; key: string; outgoing: T | null; incoming: T | null }

export interface DayGroup<T extends LedgerRow> {
  date: IsoDate
  /** Expenses and income of the day, signed. */
  subtotalCents: Cents
  items: ListItem<T>[]
}

function isTransferLeg(row: LedgerRow): boolean {
  return row.kind === 'transfer' && row.transferId !== null
}

/** Day groups in arrival order; the legs of a transfer become one item where the first leg was. */
export function groupByDay<T extends LedgerRow>(rows: readonly T[]): DayGroup<T>[] {
  const groups: DayGroup<T>[] = []
  const transfers = new Map<number, Extract<ListItem<T>, { type: 'transfer' }>>()

  for (const row of rows) {
    let group = groups.at(-1)
    if (!group || group.date !== row.date) {
      group = groups.find((item) => item.date === row.date)
      if (!group) {
        group = { date: row.date, subtotalCents: 0, items: [] }
        groups.push(group)
      }
    }

    if (isTransferLeg(row)) {
      const transferId = row.transferId as number
      const existing = transfers.get(transferId)
      const side = row.amountCents < 0 ? 'outgoing' : 'incoming'
      if (existing) {
        existing[side] = row
        continue
      }
      const item: Extract<ListItem<T>, { type: 'transfer' }> = {
        type: 'transfer',
        key: `transfer-${transferId}`,
        outgoing: null,
        incoming: null,
      }
      item[side] = row
      transfers.set(transferId, item)
      group.items.push(item)
      continue
    }

    group.subtotalCents += row.kind === 'transfer' ? 0 : row.amountCents
    group.items.push({ type: 'entry', key: `row-${row.id}`, row })
  }
  return groups
}

function previousDay(date: IsoDate): IsoDate {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const previous = new Date(Date.UTC(year, month - 1, day - 1))
  return previous.toISOString().slice(0, 10)
}

/** "today" / "yesterday" relative to the household's today, else null. */
export function relativeDay(date: IsoDate, today: IsoDate): 'today' | 'yesterday' | null {
  if (date === today) {
    return 'today'
  }
  return date === previousDay(today) ? 'yesterday' : null
}

/**
 * Payee suggestions: distinct names (case and accents ignored), in the
 * order given (most recent first), that start with what was typed, never
 * the exact text already typed.
 */
export function recentPayees(
  payees: readonly (string | null | undefined)[],
  typed: string,
  limit = 3
): string[] {
  const prefix = normalizeForSearch(typed)
  const seen = new Set<string>()
  const result: string[] = []
  for (const payee of payees) {
    if (!payee) {
      continue
    }
    const key = normalizeForSearch(payee)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    if (key.startsWith(prefix) && key !== prefix) {
      result.push(payee)
    }
    if (result.length >= limit) {
      break
    }
  }
  return result
}
