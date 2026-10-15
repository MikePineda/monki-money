import type { Transaction } from '../../../core/api/api-types'
import type { TreeCategory } from '../../../domain/category-tree'
import type { TransactionKind } from '../../../domain/money'
import type { ListItem } from '../../../domain/transaction-list'
import { categoryIcon } from '../../../shared/icons/category-icons'
import type { IconName } from '../../../shared/icons/icon-names'
import type { Person } from '../../../shared/ui/person-dot/person-dot.component'

/** Everything a transaction row renders, already worded. */
export interface TransactionRowView {
  key: string
  /** The ledger row a tap opens (the outgoing leg for a transfer). */
  id: number
  icon: IconName
  title: string
  /** "Groceries · NAB Everyday" (category · account), or the transfer's memo. */
  meta: string
  /** The payer's mark; none for transfers. */
  person: Person | null
  /** Who paid, in words, for screen readers (the dot is decorative). */
  personLabel: string
  amountCents: number
  kind: TransactionKind
  masked: boolean
}

/** Translated words the rows need. */
export interface RowLabels {
  private: string
  uncategorized: string
  split: string
  transfer: string
  noPayee: string
  /** "Transfer from {account}" for a leg whose other side is not loaded. */
  transferFrom: (account: string) => string
  transferTo: (account: string) => string
}

export interface RowContext {
  labels: RowLabels
  accountName: (accountId: number) => string
  category: (categoryId: number) => TreeCategory | undefined
  person: (userId: number | null) => Person
  personLabel: (userId: number | null) => string
}

function join(...parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(' · ')
}

/** An expense or income row. A partner's private row shows "Private" and no category. */
export function entryRowView(row: Transaction, context: RowContext): TransactionRowView {
  const { labels } = context
  const account = context.accountName(row.accountId)
  const base = {
    key: `row-${row.id}`,
    id: row.id,
    person: context.person(row.paidByUserId),
    personLabel: context.personLabel(row.paidByUserId),
    amountCents: row.amountCents,
    kind: row.kind,
    masked: row.isMasked,
  }
  if (row.isMasked) {
    return { ...base, icon: 'lock', title: labels.private, meta: account }
  }
  if (row.isSplit) {
    return {
      ...base,
      icon: 'split',
      title: row.payee || row.description || labels.noPayee,
      meta: join(labels.split, account),
    }
  }
  const category = row.categoryId === null ? undefined : context.category(row.categoryId)
  return {
    ...base,
    icon: category ? categoryIcon(category) : 'circle-dashed',
    title: row.payee || row.description || category?.name || labels.noPayee,
    meta: join(category?.name ?? labels.uncategorized, account),
  }
}

/** A transfer as one row: "From → To", the memo below, the amount with the arrow glyph. */
export function transferRowView(
  item: Extract<ListItem<Transaction>, { type: 'transfer' }>,
  context: RowContext
): TransactionRowView {
  const { labels } = context
  const leg = (item.outgoing ?? item.incoming) as Transaction
  const from = item.outgoing ? context.accountName(item.outgoing.accountId) : null
  const to = item.incoming ? context.accountName(item.incoming.accountId) : null
  const title =
    from && to ? `${from} → ${to}` : from ? labels.transferFrom(from) : labels.transferTo(to ?? '')
  return {
    key: item.key,
    id: leg.id,
    icon: 'arrow-left-right',
    title,
    meta: leg.description || labels.transfer,
    person: null,
    personLabel: '',
    amountCents: Math.abs(leg.amountCents),
    kind: 'transfer',
    masked: false,
  }
}

export function rowView(item: ListItem<Transaction>, context: RowContext): TransactionRowView {
  return item.type === 'entry' ? entryRowView(item.row, context) : transferRowView(item, context)
}
