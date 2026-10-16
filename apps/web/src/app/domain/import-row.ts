/**
 * The bank import review, row by row. Pure: no Angular, no API client.
 *
 * A staged row arrives with the importer's proposal (`resolution`, `match`,
 * `suggestion`, `transfer`, payer) and, once a person touched it, their
 * `decision` (keys left out keep the proposal; see docs/import-pipeline.md).
 * This module mirrors the API's rules (`effective_row.ts`, `review.ts`) so
 * the screen can show the outcome of a decision before the server answers:
 *
 * - {@link toneOf}: the visual state (auto, doubtful, new, duplicate,
 *   transfer, ignored);
 * - {@link allowedActions}: what the triage sheet offers for a row;
 * - {@link applyDecision}: the optimistic preview of a `PATCH`;
 * - {@link bulkAcceptSuggested}, {@link assignCategoryChanges},
 *   {@link ignoreChanges}: the bulk bar;
 * - {@link decisionsFor}: the `POST /imports/:id/confirm` payload;
 * - {@link summary}, {@link filterRows}: the header chips and the filter
 *   (a tone, or only the rows that keep confirm waiting);
 * - {@link reconciliationMessage}: the bank balance vs the ledger.
 */
import type { Cents } from './money'

/** Every resolution the importer stores (`IMPORT_RESOLUTIONS`). */
export type ImportResolution =
  | 'new'
  | 'auto_matched'
  | 'needs_confirmation'
  | 'duplicate'
  | 'transfer_leg'
  | 'ignored'
  | 'superseded'

/** What a person may set as a row's resolution (`IMPORT_DECISIONS`). */
export type DecidedResolution = 'new' | 'auto_matched' | 'transfer_leg' | 'ignored'

const DECIDED_RESOLUTIONS: readonly ImportResolution[] = [
  'new',
  'auto_matched',
  'transfer_leg',
  'ignored',
]

export type SuggestionSource = 'rule' | 'nab_map' | 'llm' | 'none'

/** The visual state of a row in the review list. */
export type ReviewTone = 'auto' | 'doubtful' | 'new' | 'duplicate' | 'transfer' | 'ignored'

export const REVIEW_TONES: readonly ReviewTone[] = [
  'auto',
  'doubtful',
  'new',
  'duplicate',
  'transfer',
  'ignored',
]

/** What the triage sheet (and the bulk bar) may do with a row. */
export type RowAction =
  /** Take the suggestion (its category, or the proposed match). */
  | 'accept'
  /** Pick a category (the row becomes a new expense or income). */
  | 'category'
  /** Spread the amount over several categories. */
  | 'split'
  /** Make it one leg of a transfer to another account. */
  | 'transfer'
  /** Link it to the existing transaction the importer found. */
  | 'link'
  /** Create a new transaction instead of a match or a transfer. */
  | 'create'
  /** Change who paid. */
  | 'payer'
  | 'ignore'
  | 'restore'

export interface SplitLine {
  categoryId: number
  /** Positive = the row's own direction. */
  amountCents: Cents
  memo?: string | null
}

/** What a person decided for a row (stored by the API in `import_rows.decision`). */
export interface RowDecision {
  categoryId?: number | null
  transferAccountId?: number | null
  matchTransactionId?: number | null
  /** null = both of us (joint). */
  paidByUserId?: number | null
  payee?: string | null
  splits?: SplitLine[]
  /** False: confirm learns no merchant rule from this row. */
  learnRule?: boolean
}

/** A `PATCH /imports/:id/rows/:rowId` body: the decision plus, maybe, a new resolution. */
export interface RowChange extends RowDecision {
  resolution?: DecidedResolution
}

/** One row's change, for the bulk actions. */
export interface RowChangeRequest {
  rowId: number
  change: RowChange
}

/** One entry of the confirm payload (`decisions[]`). */
export interface ConfirmDecision extends RowChange {
  rowId: number
}

/**
 * The fields of an `ImportRow` (API transformer) the review reads. The API
 * type satisfies it structurally, so domain/ stays free of the API client.
 */
export interface ReviewableRow {
  id: number
  date: string
  bankDate: string
  amountCents: Cents
  description: string | null
  nabMerchant: string | null
  isMasked: boolean
  isPending: boolean
  resolution: ImportResolution
  match: {
    transactionId: number
    score: number | null
    upgradesPending: boolean
    transaction: {
      date: string
      amountCents: Cents
      payee: string | null
      source: string
      status: string
    } | null
  } | null
  suggestion: {
    source: SuggestionSource
    categoryId: number | null
    confidence: number | null
    needsReview: boolean
    ruleId: number | null
    payee: string | null
  } | null
  transfer: {
    signal: string
    accountId: number | null
    legTransactionId: number | null
    ruleId: number | null
  } | null
  suggestedPaidByUserId: number | null
  decision: RowDecision | null
  decidedAt: string | null
  confirmedAt: string | null
}

/** Where the category a row shows comes from. */
export type CategorySource = 'person' | SuggestionSource

/** A row's proposal with the decision applied: what the screen draws. */
export interface RowState {
  tone: ReviewTone
  /** A person changed something on the row ("Ready" rather than "Auto"). */
  decided: boolean
  categoryId: number | null
  categorySource: CategorySource | null
  /** The model's confidence (0..1) when the category is its guess. */
  confidence: number | null
  splitCount: number
  transferAccountId: number | null
  matchTransactionId: number | null
  paidByUserId: number | null
  payee: string | null
  learnRule: boolean
  /** Confirm refuses the batch while this row waits for a decision. */
  blocking: boolean
}

function has<Key extends keyof RowDecision>(decision: RowDecision | null, key: Key): boolean {
  return decision !== null && Object.hasOwn(decision, key)
}

/** A decision value when the person set it (even to null), else the proposal. */
function pick<Key extends keyof RowDecision>(
  row: ReviewableRow,
  key: Key,
  proposal: Exclude<RowDecision[Key], undefined>
): Exclude<RowDecision[Key], undefined> {
  return has(row.decision, key)
    ? (row.decision?.[key] as Exclude<RowDecision[Key], undefined>)
    : proposal
}

function isOpen(row: ReviewableRow): boolean {
  return row.confirmedAt === null && row.resolution !== 'superseded'
}

function splitsOf(row: ReviewableRow): SplitLine[] {
  return row.decision?.splits ?? []
}

function effectiveCategory(row: ReviewableRow): number | null {
  return pick(row, 'categoryId', row.suggestion?.categoryId ?? null)
}

function categoryDecided(row: ReviewableRow): boolean {
  return has(row.decision, 'categoryId') || splitsOf(row).length > 0
}

function effectiveTransferAccount(row: ReviewableRow): number | null {
  return pick(row, 'transferAccountId', row.transfer?.accountId ?? null)
}

function effectiveMatch(row: ReviewableRow): number | null {
  return pick(row, 'matchTransactionId', row.match?.transactionId ?? null)
}

/**
 * The visual state of a row (DESIGN.md, Review row). A confirmed row (by
 * this screen or by `import:nab --confirm-auto`) is done: it keeps the tone
 * of what happened to it and is never "to review" or "new" again.
 */
export function toneOf(row: ReviewableRow): ReviewTone {
  switch (row.resolution) {
    case 'duplicate':
      return 'duplicate'
    case 'ignored':
    case 'superseded':
      return 'ignored'
    case 'transfer_leg':
      return 'transfer'
    case 'auto_matched':
      return 'auto'
  }
  if (row.confirmedAt !== null) {
    return 'auto'
  }
  if (row.resolution === 'needs_confirmation') {
    return 'doubtful'
  }
  if (splitsOf(row).length > 0) {
    return 'auto'
  }
  if (effectiveCategory(row) === null) {
    return 'new'
  }
  if (categoryDecided(row)) {
    return 'auto'
  }
  return row.suggestion?.needsReview ? 'doubtful' : 'auto'
}

/**
 * True while confirm would refuse the batch because of this row (API
 * `confirmActionFor` = null): a possible match or an unknown transfer
 * account, a transfer leg without its other account, a match without its
 * transaction once a person touched it.
 */
function isBlocking(row: ReviewableRow): boolean {
  if (!isOpen(row)) {
    return false
  }
  switch (row.resolution) {
    case 'needs_confirmation':
      return true
    case 'transfer_leg':
      return effectiveTransferAccount(row) === null
    case 'auto_matched':
      return effectiveMatch(row) === null && row.decidedAt !== null
    default:
      return false
  }
}

export function rowState(row: ReviewableRow): RowState {
  const categoryId = effectiveCategory(row)
  const byPerson = categoryDecided(row)
  const source: CategorySource | null = byPerson
    ? 'person'
    : categoryId === null
      ? null
      : (row.suggestion?.source ?? null)
  return {
    tone: toneOf(row),
    decided: row.decidedAt !== null,
    categoryId,
    categorySource: source,
    confidence: source === 'llm' ? (row.suggestion?.confidence ?? null) : null,
    splitCount: splitsOf(row).length,
    transferAccountId: effectiveTransferAccount(row),
    matchTransactionId: effectiveMatch(row),
    paidByUserId: pick(row, 'paidByUserId', row.suggestedPaidByUserId),
    payee: pick(row, 'payee', row.suggestion?.payee ?? null),
    learnRule: row.decision?.learnRule !== false,
    blocking: isBlocking(row),
  }
}

/** What the row is called: the payee, else the bank's merchant name, else the bank text. */
export function rowTitle(row: ReviewableRow): string {
  if (row.isMasked) {
    return ''
  }
  const payee = pick(row, 'payee', row.suggestion?.payee ?? null)
  return payee?.trim() || row.nabMerchant?.trim() || row.description?.trim() || ''
}

/** The change "Accept" makes, or null when there is nothing to accept. */
export function acceptChange(row: ReviewableRow): RowChange | null {
  if (row.isMasked || !isOpen(row)) {
    return null
  }
  if (row.resolution === 'needs_confirmation') {
    if (row.match) {
      return { resolution: 'auto_matched', matchTransactionId: row.match.transactionId }
    }
    const categoryId = row.suggestion?.categoryId ?? null
    return categoryId === null ? null : { resolution: 'new', categoryId }
  }
  if (row.resolution === 'new' && toneOf(row) === 'doubtful') {
    const categoryId = row.suggestion?.categoryId ?? null
    return categoryId === null ? null : { categoryId }
  }
  return null
}

/** The change "Restore" makes: back to the match or transfer found, else a new row. */
export function restoreChange(row: ReviewableRow): RowChange {
  const matchTransactionId = effectiveMatch(row)
  if (matchTransactionId !== null) {
    return { resolution: 'auto_matched', matchTransactionId }
  }
  const transferAccountId = effectiveTransferAccount(row)
  if (transferAccountId !== null) {
    return { resolution: 'transfer_leg', transferAccountId }
  }
  return { resolution: 'new' }
}

/** What the triage sheet offers for a row; nothing for masked or closed rows. */
export function allowedActions(row: ReviewableRow): ReadonlySet<RowAction> {
  const actions = new Set<RowAction>()
  if (row.isMasked || !isOpen(row) || row.resolution === 'duplicate') {
    return actions
  }
  if (row.resolution === 'ignored') {
    if (row.amountCents !== 0) {
      actions.add('restore')
    }
    return actions
  }
  // A movement of 0.00 can only be ignored (API: `resolution`/`zeroAmount`).
  if (row.amountCents !== 0) {
    if (acceptChange(row)) {
      actions.add('accept')
    }
    if (row.resolution !== 'auto_matched') {
      actions.add('category')
      actions.add('split')
      actions.add('payer')
    }
    actions.add('transfer')
    if (row.match && row.resolution !== 'auto_matched') {
      actions.add('link')
    }
    if (row.resolution !== 'new') {
      actions.add('create')
    }
  }
  actions.add('ignore')
  return actions
}

/**
 * The optimistic preview of a `PATCH`: the resolution moves, decision keys
 * merge (an explicit null is kept, a key left out keeps what was there),
 * and the row counts as decided. Returns a new row.
 */
export function applyDecision<Row extends ReviewableRow>(
  row: Row,
  change: RowChange,
  decidedAt: string = row.decidedAt ?? 'local'
): Row {
  const { resolution, ...keys } = change
  const decision: RowDecision = { ...(row.decision ?? {}) }
  for (const [key, value] of Object.entries(keys)) {
    if (value !== undefined) {
      Object.assign(decision, { [key]: value })
    }
  }
  return { ...row, resolution: resolution ?? row.resolution, decision, decidedAt }
}

/** "Accept suggested": the doubtful (or new) rows that carry something to accept. */
export function bulkAcceptSuggested(rows: readonly ReviewableRow[]): RowChangeRequest[] {
  return rows.flatMap((row) => {
    const tone = toneOf(row)
    if (tone !== 'doubtful' && tone !== 'new') {
      return []
    }
    const change = acceptChange(row)
    return change ? [{ rowId: row.id, change }] : []
  })
}

/** "Assign category" for the selected rows that can take one. */
export function assignCategoryChanges(
  rows: readonly ReviewableRow[],
  categoryId: number
): RowChangeRequest[] {
  return rows.flatMap((row) => {
    if (!allowedActions(row).has('category')) {
      return []
    }
    const change: RowChange =
      row.resolution === 'new' ? { categoryId } : { resolution: 'new', categoryId }
    if (splitsOf(row).length > 0) {
      change.splits = []
    }
    return [{ rowId: row.id, change }]
  })
}

/** "Ignore" for the selected rows that can be ignored. */
export function ignoreChanges(rows: readonly ReviewableRow[]): RowChangeRequest[] {
  return rows
    .filter((row) => allowedActions(row).has('ignore'))
    .map((row) => ({ rowId: row.id, change: { resolution: 'ignored' } }))
}

/**
 * The `decisions[]` of confirm: every open row a person touched, with its
 * decided resolution and stored keys. The same decisions were already sent
 * row by row; repeating them makes confirm self-contained (a lost `PATCH`
 * still lands) and is harmless (the API applies them again).
 */
export function decisionsFor(rows: readonly ReviewableRow[]): ConfirmDecision[] {
  return rows
    .filter((row) => row.decidedAt !== null && !row.isMasked && isOpen(row))
    .map((row) => {
      const entry: ConfirmDecision = { rowId: row.id }
      if (DECIDED_RESOLUTIONS.includes(row.resolution)) {
        entry.resolution = row.resolution as DecidedResolution
      }
      return { ...entry, ...(row.decision ?? {}) }
    })
}

/** Rows that keep confirm from closing the batch, in file order. */
export function blockingRowIds(rows: readonly ReviewableRow[]): number[] {
  return rows.filter(isBlocking).map((row) => row.id)
}

export interface ReviewSummary extends Record<ReviewTone, number> {
  /** Rows on screen (duplicates are counted by the batch, never listed). */
  total: number
  blocking: number
  /** Rows "Accept suggested" would change. */
  acceptable: number
}

/**
 * The header chips: rows per tone. The API never stores duplicates (their
 * hash already is), so their count comes from the batch (`counts.duplicate`).
 */
export function summary(rows: readonly ReviewableRow[], duplicates = 0): ReviewSummary {
  const counts: ReviewSummary = {
    auto: 0,
    doubtful: 0,
    new: 0,
    duplicate: duplicates,
    transfer: 0,
    ignored: 0,
    total: rows.length,
    blocking: 0,
    acceptable: bulkAcceptSuggested(rows).length,
  }
  for (const row of rows) {
    counts[toneOf(row)] += 1
    if (isBlocking(row)) {
      counts.blocking += 1
    }
  }
  return counts
}

/**
 * What the list shows: every row, the rows of one tone, or `blocking`, only
 * the rows confirm waits for ({@link blockingRowIds}). "To review" is wider
 * than `blocking`: a category under review is worth a look but does not stop
 * the confirm.
 */
export type ReviewFilter = 'all' | 'blocking' | ReviewTone

export function filterRows<Row extends ReviewableRow>(
  rows: readonly Row[],
  filter: ReviewFilter
): Row[] {
  switch (filter) {
    case 'all':
      return [...rows]
    case 'blocking':
      return rows.filter(isBlocking)
    default:
      return rows.filter((row) => toneOf(row) === filter)
  }
}

/**
 * Rows the model may still categorize (API classify): open, readable rows
 * headed for spending or income whose category is missing or under review
 * and that no person categorized.
 */
export function classifiableRows<Row extends ReviewableRow>(rows: readonly Row[]): Row[] {
  return rows.filter((row) => {
    if (row.isMasked || !isOpen(row) || categoryDecided(row)) {
      return false
    }
    if (row.resolution !== 'new' && row.resolution !== 'needs_confirmation') {
      return false
    }
    if (row.resolution === 'needs_confirmation' && (row.match || row.transfer)) {
      return false
    }
    return effectiveCategory(row) === null || row.suggestion?.needsReview === true
  })
}

/**
 * A digest of every row's suggestion: unchanged between two polls means the
 * classify run left nothing new to show.
 */
export function suggestionFingerprint(rows: readonly ReviewableRow[]): string {
  return rows
    .map(
      (row) =>
        `${row.id}:${row.suggestion?.source ?? '-'}:${row.suggestion?.categoryId ?? '-'}:` +
        `${row.suggestion?.needsReview ? 1 : 0}`
    )
    .join('|')
}

/** The batch's `reconciliation` (API `reconcile()`). */
export interface Reconciliation {
  asOf: string | null
  expectedBalanceCents: Cents | null
  computedBalanceCents: Cents | null
  differenceCents: Cents | null
  balanced: boolean | null
  openingBalanceCents: Cents | null
  missingBefore: string | null
}

/** What the result screen says about the bank's balance against the ledger. */
export type ReconciliationMessage =
  | { status: 'balanced'; asOf: string | null; balanceCents: Cents | null }
  | { status: 'missing'; before: string; differenceCents: Cents }
  | { status: 'differs'; differenceCents: Cents }
  | { status: 'unknown' }

export function reconciliationMessage(
  reconciliation: Reconciliation | null | undefined
): ReconciliationMessage {
  if (!reconciliation || reconciliation.balanced === null) {
    return { status: 'unknown' }
  }
  if (reconciliation.balanced) {
    return {
      status: 'balanced',
      asOf: reconciliation.asOf,
      balanceCents: reconciliation.expectedBalanceCents,
    }
  }
  const differenceCents = reconciliation.differenceCents ?? 0
  return reconciliation.missingBefore
    ? { status: 'missing', before: reconciliation.missingBefore, differenceCents }
    : { status: 'differs', differenceCents }
}
