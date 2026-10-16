import type { ImportRow } from '../../../core/api/api-types'
import { formatWeekdayDate } from '../../../domain/dates'
import {
  acceptChange,
  allowedActions,
  isGuessedTransfer,
  rowState,
  rowTitle,
  type ReviewTone,
} from '../../../domain/import-row'
import { formatTransactionAmount, type TransactionKind } from '../../../domain/money'
import type { IconName } from '../../../shared/icons/icon-names'
import type { Person } from '../../../shared/ui/person-dot/person-dot.component'

/** Everything one review row draws, already worded. */
export interface ImportRowView {
  id: number
  tone: ReviewTone
  title: string
  masked: boolean
  /** "Sat 27 Sep · Groceries · Bank". */
  meta: string
  person: Person | null
  /** Who paid, in words (read by screen readers next to the dot). */
  personLabel: string
  amountCents: number
  kind: TransactionKind
  amountText: string
  /** Ignored and duplicate rows recede to ink-3. */
  muted: boolean
  status: { icon: IconName; label: string; iconClass: string }
  /** A doubtful row's suggestion, offered inline with "Accept" ("Groceries ?"). */
  suggestion: string | null
  /**
   * The row can be ticked for a bulk action (never once confirmed, masked,
   * a duplicate or a 0.00 row already ignored); ignored rows take "Restore".
   */
  selectable: boolean
  checkLabel: string
}

/** How a transfer row names its other account, in one direction. */
export interface TransferWords {
  known: (account: string) => string
  /** The other account is the importer's guess. */
  guessed: (account: string) => string
  /** No other account found. */
  unknown: string
}

/** The words and lookups a row needs; the page builds it from its catalogue and stores. */
export interface ImportRowContext {
  locale: string
  labels: {
    auto: string
    ready: string
    review: string
    new: string
    transfer: string
    ignored: string
    duplicate: string
    /** A duplicate: the ledger row it repeats, by its date and amount. */
    duplicateOf: (date: string, amount: string) => string
    /** A duplicate whose first copy was ignored (nothing in the ledger). */
    duplicateIgnored: string
    private: string
    uncategorized: string
    /** `llm` takes the model's confidence as a percentage, or null when unknown. */
    bySource: { rule: string; nab_map: string; llm: (percent: number | null) => string }
    split: (count: number) => string
    /** A debit that went to another own account. */
    transferTo: TransferWords
    /** A credit that came in from another own account. */
    transferFrom: TransferWords
    matches: (payee: string) => string
    possibleMatch: (payee: string) => string
    suggestion: (category: string) => string
    select: (title: string, amount: string) => string
  }
  category: (id: number) => string | null
  account: (id: number) => string | null
  person: (userId: number | null) => Person
  personLabel: (userId: number | null) => string
}

const STATUS_ICON: Record<ReviewTone, IconName> = {
  auto: 'circle-check',
  doubtful: 'triangle-alert',
  new: 'circle-plus',
  transfer: 'arrow-left-right',
  ignored: 'ban',
  duplicate: 'copy',
}

/** Status marks (DESIGN.md, Review row): shape plus a word, never colour alone. */
const STATUS_CLASS: Record<ReviewTone, string> = {
  auto: 'text-status-good',
  doubtful: 'text-status-warning',
  new: 'text-accent',
  transfer: 'text-ink-3',
  ignored: 'text-ink-3',
  duplicate: 'text-ink-3',
}

function statusLabel(tone: ReviewTone, decided: boolean, context: ImportRowContext): string {
  const { labels } = context
  switch (tone) {
    case 'auto':
      return decided ? labels.ready : labels.auto
    case 'doubtful':
      return labels.review
    case 'new':
      return labels.new
    case 'transfer':
      return labels.transfer
    case 'ignored':
      return labels.ignored
    case 'duplicate':
      return labels.duplicate
  }
}

/** What the row will be, in a few words: its category, transfer target or match. */
function whatItIs(row: ImportRow, context: ImportRowContext): string[] {
  const { labels } = context
  const state = rowState(row)
  if (row.resolution === 'ignored' || row.resolution === 'superseded') {
    return []
  }
  if (row.resolution === 'duplicate') {
    const copy = row.match?.transaction
    if (!copy) {
      return [labels.duplicateIgnored]
    }
    const kind: TransactionKind = copy.amountCents < 0 ? 'expense' : 'income'
    return [
      labels.duplicateOf(
        formatWeekdayDate(copy.date, context.locale),
        formatTransactionAmount(copy.amountCents, kind, context.locale)
      ),
    ]
  }
  if (
    row.resolution === 'transfer_leg' ||
    (row.resolution === 'needs_confirmation' && row.transfer)
  ) {
    const account =
      state.transferAccountId === null ? null : context.account(state.transferAccountId)
    // A credit came in from the other account; a debit went out to it.
    const words = row.amountCents > 0 ? labels.transferFrom : labels.transferTo
    if (!account) {
      return [words.unknown]
    }
    return [isGuessedTransfer(row) ? words.guessed(account) : words.known(account)]
  }
  if (row.resolution === 'auto_matched') {
    return [labels.matches(row.match?.transaction?.payee ?? '')].filter(Boolean)
  }
  if (row.resolution === 'needs_confirmation' && row.match) {
    return [labels.possibleMatch(row.match.transaction?.payee ?? '')]
  }
  if (state.splitCount > 0) {
    return [labels.split(state.splitCount)]
  }
  if (state.categoryId === null) {
    return [labels.uncategorized]
  }
  const name = context.category(state.categoryId) ?? ''
  if (state.tone === 'doubtful') {
    // The suggestion goes in the inline chip; say where it comes from.
    return [sourceLabel(state.categorySource, state.confidence, context)].filter(Boolean)
  }
  return [name, sourceLabel(state.categorySource, state.confidence, context)].filter(Boolean)
}

function sourceLabel(
  source: string | null,
  confidence: number | null,
  context: ImportRowContext
): string {
  const { bySource } = context.labels
  switch (source) {
    case 'rule':
      return bySource.rule
    case 'nab_map':
      return bySource.nab_map
    case 'llm':
      return bySource.llm(confidence === null ? null : Math.round(confidence * 100))
    default:
      return ''
  }
}

/** Builds the row's view model from the API row and the page's context. */
export function importRowView(row: ImportRow, context: ImportRowContext): ImportRowView {
  const state = rowState(row)
  const tone = state.tone
  // A guessed transfer is still a transfer leg, only "to review".
  const transfer = row.resolution === 'transfer_leg'
  const kind: TransactionKind = transfer ? 'transfer' : row.amountCents < 0 ? 'expense' : 'income'
  const amountText = formatTransactionAmount(row.amountCents, kind, context.locale)
  const title = row.isMasked ? context.labels.private : rowTitle(row)
  const date = formatWeekdayDate(row.date, context.locale)
  const accept = acceptChange(row)
  const suggestion =
    tone === 'doubtful' && accept && 'categoryId' in accept && accept.categoryId
      ? context.labels.suggestion(context.category(accept.categoryId) ?? '')
      : null
  const joint = state.paidByUserId === null
  return {
    id: row.id,
    tone,
    title,
    masked: row.isMasked,
    meta: [date, ...(row.isMasked ? [] : whatItIs(row, context))].join(' · '),
    person:
      row.isMasked || tone === 'ignored' || tone === 'duplicate'
        ? null
        : context.person(state.paidByUserId),
    personLabel: joint && transfer ? '' : context.personLabel(state.paidByUserId),
    amountCents: row.amountCents,
    kind,
    amountText,
    muted: tone === 'ignored' || tone === 'duplicate',
    status: {
      icon: STATUS_ICON[tone],
      label: statusLabel(tone, state.decided, context),
      iconClass: STATUS_CLASS[tone],
    },
    suggestion,
    // Only rows a bulk action can still change: a confirmed row offers no checkbox.
    selectable: allowedActions(row).size > 0,
    checkLabel: context.labels.select(title, amountText),
  }
}
