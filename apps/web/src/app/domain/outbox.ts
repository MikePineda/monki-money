import { isIsoDate, monthOf, type IsoDate, type YearMonth } from './month'
import type { RecentEntry } from './quick-add-defaults'

/**
 * The offline outbox: creates that could not reach the API yet, kept on the
 * device until they sync. Pure (no Angular, no storage, no clock: callers
 * pass `now`); every function returns a new list and never mutates its input.
 *
 * - An entry is keyed by the create's `clientId`, which makes every retry
 *   idempotent on the API (a replay answers the row it already created).
 * - Entries sync one at a time in FIFO order; only `pending` ones are picked.
 * - A retryable failure (no network, 5xx, throttled) keeps the entry
 *   `pending` and counts the attempt (the next try waits `backoffMs`); a
 *   failure the server would repeat (a 4xx such as a 422) makes it `failed`
 *   with the server's message until the person retries, edits or discards it.
 * - `serialize`/`readStored` carry a schema version; reading is tolerant: a
 *   corrupt entry is dropped and the rest survive, nothing ever throws, and
 *   an entry a newer build wrote (a kind, a field or a source this build
 *   does not know) is kept untouched and written back as it was, so a tab
 *   still running an older build never drops what a newer one queued.
 * - The device copy is shared by every open tab: `reconcile` merges it with
 *   what one tab holds, so neither tab drops the other's entries.
 * - `queuedAsRecent` lets quick add rank what is queued like ledger rows.
 */

/**
 * The newest schema this build understands. 2: transfers carry `tags`.
 * 3: expenses and incomes may carry `splits` and `source` (a scanned
 * receipt). Older outboxes still read. A newer one reads too: its entries
 * made only of fields this build knows are acted on, the rest are kept
 * untouched. So a later version must never change what an existing field
 * means: it adds a field, a kind or a source instead.
 */
export const OUTBOX_VERSION = 3
/** The schema an outbox without receipts is written in (the build before receipts reads it). */
const BASE_VERSION = 2
export const BACKOFF_BASE_MS = 1_000
export const BACKOFF_MAX_MS = 60_000

export type OutboxKind = 'transaction' | 'transfer'
export type OutboxStatus = 'pending' | 'syncing' | 'failed'

/** Why the last attempt failed: an API error code and its (localized) message, possibly ''. */
export interface OutboxError {
  code: string
  message: string
}

/** One line of a split expense or income (`POST /transactions` `splits`). */
export interface OutboxSplit {
  categoryId: number
  amountCents: number
  memo: string | null
}

/**
 * The body of `POST /transactions/quick` for an expense or income (amount
 * positive); with `splits` or `source` (a scanned receipt), the body of
 * `POST /transactions` instead (see {@link usesFullCreate}).
 */
export interface TransactionPayload {
  clientId: string
  kind: 'expense' | 'income'
  accountId: number
  date: IsoDate
  amountCents: number
  categoryId: number | null
  payee: string | null
  description: string | null
  paidByUserId: number | null
  isPrivate: boolean
  tags: string[]
  /** The receipt's lines (at least two, adding up to the amount); `categoryId` is null then. */
  splits?: OutboxSplit[]
  /** `receipt`: a scanned receipt. Absent: an entry typed in quick add. */
  source?: 'receipt'
}

/** The body of `POST /transfers` (amount positive, two different accounts; tags on both legs). */
export interface TransferPayload {
  clientId: string
  fromAccountId: number
  toAccountId: number
  date: IsoDate
  amountCents: number
  memo: string | null
  tags: string[]
}

/** What gets queued: the kind of create and its API body. */
export type OutboxItem =
  | { kind: 'transaction'; payload: TransactionPayload }
  | { kind: 'transfer'; payload: TransferPayload }

interface EntryState {
  /** The payload's `clientId`. */
  id: string
  /** ISO timestamp of the first save on this device. */
  createdAt: string
  /** Attempts that failed so far (drives the backoff). */
  attempts: number
  status: OutboxStatus
  error: OutboxError | null
  /** The month the entry is dated in (the one to refresh once it syncs). */
  month: YearMonth
}

export type OutboxEntry = EntryState & OutboxItem

/** Adds an entry at the end of the line; the same client id twice (a double tap) keeps one. */
export function enqueue(
  entries: readonly OutboxEntry[],
  item: OutboxItem,
  now: Date
): OutboxEntry[] {
  const id = item.payload.clientId
  if (entries.some((entry) => entry.id === id)) {
    return [...entries]
  }
  const entry = {
    ...item,
    id,
    createdAt: now.toISOString(),
    attempts: 0,
    status: 'pending',
    error: null,
    month: monthOf(item.payload.date),
  } as OutboxEntry
  return [...entries, entry]
}

function update(
  entries: readonly OutboxEntry[],
  id: string,
  change: (entry: OutboxEntry) => OutboxEntry
): OutboxEntry[] {
  return entries.map((entry) => (entry.id === id ? change(entry) : entry))
}

/** The entry's request is on its way. */
export function markSyncing(entries: readonly OutboxEntry[], id: string): OutboxEntry[] {
  return update(entries, id, (entry) => ({ ...entry, status: 'syncing' }))
}

/** The API has the row: the entry leaves the outbox. */
export function markSynced(entries: readonly OutboxEntry[], id: string): OutboxEntry[] {
  return entries.filter((entry) => entry.id !== id)
}

/**
 * The attempt failed. Retryable: back in line (`pending`) with one more
 * attempt. Not retryable: `failed` with the error until someone acts on it.
 */
export function markFailed(
  entries: readonly OutboxEntry[],
  id: string,
  error: OutboxError,
  retryable: boolean
): OutboxEntry[] {
  return update(entries, id, (entry) => ({
    ...entry,
    status: retryable ? 'pending' : 'failed',
    attempts: entry.attempts + 1,
    error: { ...error },
  }))
}

/** "Retry": failed entries (one, or all without an id) go back in line with a clean slate. */
export function retry(entries: readonly OutboxEntry[], id?: string): OutboxEntry[] {
  return entries.map((entry) =>
    entry.status === 'failed' && (id === undefined || entry.id === id)
      ? { ...entry, status: 'pending', attempts: 0, error: null }
      : entry
  )
}

/**
 * "Edit": the entry takes a new body in its place in line, keeping its
 * client id (the API never ends up with two rows for one entry).
 */
export function replace(
  entries: readonly OutboxEntry[],
  id: string,
  item: OutboxItem
): OutboxEntry[] {
  return update(
    entries,
    id,
    (entry) =>
      ({
        ...item,
        payload: { ...receiptDetails(entry, item), ...item.payload, clientId: id },
        id,
        createdAt: entry.createdAt,
        attempts: 0,
        status: 'pending',
        error: null,
        month: monthOf(item.payload.date),
      }) as OutboxEntry
  )
}

/**
 * What an edit in quick add (which knows neither lines nor sources) keeps
 * of a queued receipt: it stays a receipt, and keeps its lines while the
 * amount is the same and no single category was picked instead.
 */
function receiptDetails(
  entry: OutboxEntry,
  item: OutboxItem
): Pick<TransactionPayload, 'splits' | 'source'> {
  if (entry.kind !== 'transaction' || item.kind !== 'transaction') {
    return {}
  }
  const { splits, source } = entry.payload
  const keepLines =
    splits !== undefined &&
    item.payload.amountCents === entry.payload.amountCents &&
    item.payload.categoryId === null
  return {
    ...(source === undefined ? {} : { source }),
    ...(keepLines ? { splits: splits.map((line) => ({ ...line })) } : {}),
  }
}

/** "Discard": the entry is dropped without ever reaching the API. */
export function discard(entries: readonly OutboxEntry[], id: string): OutboxEntry[] {
  return entries.filter((entry) => entry.id !== id)
}

/**
 * Whether the entry syncs with `POST /transactions` (a receipt: lines or a
 * source, which quick add's `POST /transactions/quick` does not take).
 */
export function usesFullCreate(entry: OutboxEntry): boolean {
  return (
    entry.kind === 'transaction' &&
    (entry.payload.splits !== undefined || entry.payload.source !== undefined)
  )
}

/** The oldest `pending` entry, skipping the ones in `skip` (being edited); null when none. */
export function nextToSync(
  entries: readonly OutboxEntry[],
  skip: ReadonlySet<string> = new Set()
): OutboxEntry | null {
  return entries.find((entry) => entry.status === 'pending' && !skip.has(entry.id)) ?? null
}

/** Wait before the next try after `attempts` failures: 1 s, 2 s, 4 s… capped at 60 s. */
export function backoffMs(attempts: number): number {
  const exponent = Math.max(0, attempts - 1)
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.min(exponent, 16))
}

/* ------------------------------------------------------------- two tabs */

/**
 * One tab's outbox against the device copy, which every open tab writes:
 * the device copy wins (another tab may have queued, synced, edited or
 * discarded entries since), except that an entry this tab is sending right
 * now stays `syncing` (stored, it reads as `pending`). With `keepUnstored`
 * (this tab's last write was refused, so the device copy is behind) this
 * tab's entries the device does not have are kept after the stored ones;
 * otherwise they were removed by another tab and go.
 */
export function reconcile(
  stored: readonly OutboxEntry[],
  local: readonly OutboxEntry[],
  keepUnstored: boolean
): OutboxEntry[] {
  const sending = new Set(
    local.filter((entry) => entry.status === 'syncing').map((entry) => entry.id)
  )
  const merged = stored.map((entry) =>
    sending.has(entry.id) ? ({ ...entry, status: 'syncing' } as OutboxEntry) : entry
  )
  if (!keepUnstored) {
    return merged
  }
  const known = new Set(stored.map((entry) => entry.id))
  return [...merged, ...local.filter((entry) => !known.has(entry.id))]
}

/* ------------------------------------------------------------ rankings */

/** Above any ledger id, so a queued entry wins a tie as the latest use. */
const QUEUED_ID_CEILING = Number.MAX_SAFE_INTEGER

/**
 * Queued entries as ledger rows for quick add's rankings (categories,
 * payees, transfer routes, the latest account), newest first like the API
 * lists them, so an entry saved offline counts before it syncs. They have
 * no server id: each gets one above any real row's, the newest highest
 * (a transfer's two legs share it as their transfer id). The outbox is per
 * person, so `createdByUserId` is its owner.
 */
export function queuedAsRecent(
  entries: readonly OutboxEntry[],
  createdByUserId: number | null
): RecentEntry[] {
  const rows: RecentEntry[] = []
  entries.forEach((entry, index) => {
    const id = QUEUED_ID_CEILING - (entries.length - 1 - index)
    const base = { id, date: entry.payload.date, createdByUserId, payee: null, categoryId: null }
    if (entry.kind === 'transfer') {
      const { fromAccountId, toAccountId, amountCents } = entry.payload
      rows.unshift(
        {
          ...base,
          kind: 'transfer',
          accountId: fromAccountId,
          amountCents: -amountCents,
          transferId: id,
        },
        { ...base, kind: 'transfer', accountId: toAccountId, amountCents, transferId: id }
      )
      return
    }
    const { kind, accountId, amountCents, categoryId, payee } = entry.payload
    rows.unshift({
      ...base,
      kind,
      accountId,
      amountCents: kind === 'expense' ? -amountCents : amountCents,
      categoryId,
      payee,
      transferId: null,
    })
  })
  return rows
}

/* ----------------------------------------------------------- persistence */

/**
 * Entries of the stored outbox this build does not understand (a newer
 * build wrote them), exactly as stored, and the schema version the stored
 * copy had. They are never synced, shown or changed here; every write puts
 * them back after this build's entries.
 */
export interface KeptEntries {
  version: number
  entries: readonly unknown[]
}

/** What `readStored` found: the entries this build acts on and the ones it keeps untouched. */
export interface StoredOutbox {
  entries: OutboxEntry[]
  kept: KeptEntries
}

export const NOTHING_KEPT: KeptEntries = { version: 0, entries: [] }

/** The lowest schema version that describes these entries (receipts need 3). */
function versionFor(entries: readonly OutboxEntry[]): number {
  return entries.some(usesFullCreate) ? 3 : BASE_VERSION
}

/** The outbox as stored; entries kept from a newer build go back untouched after this build's. */
export function serialize(
  entries: readonly OutboxEntry[],
  kept: KeptEntries = NOTHING_KEPT
): string {
  const version = Math.max(versionFor(entries), kept.entries.length > 0 ? kept.version : 0)
  return JSON.stringify({ version, entries: [...entries, ...kept.entries] })
}

/** The entries this build can act on (see {@link readStored}). */
export function deserialize(raw: string | null): OutboxEntry[] {
  return readStored(raw).entries
}

/**
 * Reads what `serialize` wrote, never throwing: anything unreadable is no
 * outbox, a corrupt entry is dropped and the rest survive, and an entry
 * made of something this build does not know (`reader`: the schema it
 * understands; specs play older builds with it) is kept untouched.
 */
export function readStored(raw: string | null, reader: number = OUTBOX_VERSION): StoredOutbox {
  const nothing: StoredOutbox = { entries: [], kept: NOTHING_KEPT }
  if (!raw) {
    return nothing
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return nothing
  }
  const version = isRecord(parsed) ? parsed['version'] : undefined
  const list = isRecord(parsed) ? parsed['entries'] : undefined
  if (!isVersion(version) || !Array.isArray(list)) {
    return nothing
  }
  const seen = new Set<string>()
  const entries: OutboxEntry[] = []
  const kept: unknown[] = []
  for (const candidate of list) {
    if (!isRecord(candidate)) {
      continue
    }
    const id = candidate['id']
    if (typeof id !== 'string' || id === '' || seen.has(id)) {
      continue
    }
    if (!understands(candidate, reader)) {
      seen.add(id)
      kept.push(candidate)
      continue
    }
    const entry = readEntry(candidate)
    if (entry) {
      seen.add(id)
      entries.push(entry)
    }
  }
  return { entries, kept: { version, entries: kept } }
}

function isVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

/* What each schema version added: an entry with anything else came from a newer build. */

type FieldHistory = readonly (readonly [since: number, fields: readonly string[]])[]

const ENTRY_FIELDS = new Set([
  'id',
  'kind',
  'payload',
  'createdAt',
  'attempts',
  'status',
  'error',
  'month',
])
const TRANSACTION_FIELDS: FieldHistory = [
  [
    1,
    [
      'clientId',
      'kind',
      'accountId',
      'date',
      'amountCents',
      'categoryId',
      'payee',
      'description',
      'paidByUserId',
      'isPrivate',
      'tags',
    ],
  ],
  [3, ['splits', 'source']],
]
const TRANSFER_FIELDS: FieldHistory = [
  [1, ['clientId', 'fromAccountId', 'toAccountId', 'date', 'amountCents', 'memo']],
  [2, ['tags']],
]
const SPLIT_FIELDS = new Set(['categoryId', 'amountCents', 'memo'])
/** The receipt sources a reader of version 3 or later knows. */
const SOURCES: readonly unknown[] = ['receipt']

function fieldsUpTo(history: FieldHistory, reader: number): ReadonlySet<string> {
  return new Set(history.flatMap(([since, fields]) => (since <= reader ? fields : [])))
}

function onlyKnown(value: Json, known: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => known.has(key))
}

/**
 * Whether a build that understands schema `reader` knows every part of
 * this entry (its fields, its kind, its payload's fields and source, its
 * lines' fields). One it knows may still be corrupt (`readEntry` decides).
 */
function understands(value: Json, reader: number): boolean {
  if (!onlyKnown(value, ENTRY_FIELDS)) {
    return false
  }
  const kind = value['kind']
  const payload = value['payload']
  if (!isRecord(payload)) {
    // No payload is corrupt, not newer.
    return kind === 'transaction' || kind === 'transfer'
  }
  if (kind === 'transfer') {
    return onlyKnown(payload, fieldsUpTo(TRANSFER_FIELDS, reader))
  }
  if (kind !== 'transaction' || !onlyKnown(payload, fieldsUpTo(TRANSACTION_FIELDS, reader))) {
    return false
  }
  const source = payload['source']
  if (typeof source === 'string' && !SOURCES.includes(source)) {
    return false
  }
  const splits = payload['splits']
  return (
    !Array.isArray(splits) ||
    splits.every((line) => !isRecord(line) || onlyKnown(line, SPLIT_FIELDS))
  )
}

type Json = Record<string, unknown>

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function isAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function idOrNull(value: unknown): number | null {
  return isId(value) ? value : null
}

function readTags(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === 'string') : []
}

function readEntry(value: unknown): OutboxEntry | null {
  if (!isRecord(value)) {
    return null
  }
  const id = value['id']
  if (typeof id !== 'string' || id === '') {
    return null
  }
  const item = readItem(value['kind'], value['payload'], id)
  if (!item) {
    return null
  }
  const attempts = value['attempts']
  const status = value['status'] === 'failed' ? 'failed' : 'pending'
  return {
    ...item,
    id,
    createdAt: typeof value['createdAt'] === 'string' ? value['createdAt'] : '',
    attempts:
      typeof attempts === 'number' && Number.isSafeInteger(attempts) && attempts > 0 ? attempts : 0,
    // A sync cut short by closing the app is just pending again.
    status,
    error: readError(value['error']),
    month: monthOf(item.payload.date),
  }
}

/** A receipt's `splits` and `source` (both optional); null when either is corrupt. */
function readReceipt(payload: Json): Pick<TransactionPayload, 'splits' | 'source'> | null {
  const read: Pick<TransactionPayload, 'splits' | 'source'> = {}
  const source = payload['source']
  if (source !== undefined) {
    if (source !== 'receipt') {
      return null
    }
    read.source = source
  }
  const splits = payload['splits']
  if (splits !== undefined) {
    const lines = Array.isArray(splits) ? splits.map(readSplit) : []
    if (lines.length < 2 || lines.includes(null)) {
      return null
    }
    read.splits = lines as OutboxSplit[]
  }
  return read
}

function readSplit(value: unknown): OutboxSplit | null {
  if (!isRecord(value)) {
    return null
  }
  const { categoryId, amountCents } = value
  if (!isId(categoryId) || typeof amountCents !== 'number' || !Number.isSafeInteger(amountCents)) {
    return null
  }
  return { categoryId, amountCents, memo: textOrNull(value['memo']) }
}

function readError(value: unknown): OutboxError | null {
  if (!isRecord(value)) {
    return null
  }
  const { code, message } = value
  return typeof code === 'string' && typeof message === 'string' ? { code, message } : null
}

function readItem(kind: unknown, payload: unknown, id: string): OutboxItem | null {
  if (!isRecord(payload) || payload['clientId'] !== id) {
    return null
  }
  const date = payload['date']
  const amountCents = payload['amountCents']
  if (typeof date !== 'string' || !isIsoDate(date) || !isAmount(amountCents)) {
    return null
  }
  if (kind === 'transaction') {
    const entryKind = payload['kind']
    const accountId = payload['accountId']
    const receipt = readReceipt(payload)
    if ((entryKind !== 'expense' && entryKind !== 'income') || !isId(accountId) || !receipt) {
      return null
    }
    return {
      kind,
      payload: {
        clientId: id,
        kind: entryKind,
        accountId,
        date,
        amountCents,
        categoryId: idOrNull(payload['categoryId']),
        payee: textOrNull(payload['payee']),
        description: textOrNull(payload['description']),
        paidByUserId: idOrNull(payload['paidByUserId']),
        isPrivate: payload['isPrivate'] === true,
        tags: readTags(payload['tags']),
        ...receipt,
      },
    }
  }
  if (kind === 'transfer') {
    const fromAccountId = payload['fromAccountId']
    const toAccountId = payload['toAccountId']
    if (!isId(fromAccountId) || !isId(toAccountId)) {
      return null
    }
    return {
      kind,
      payload: {
        clientId: id,
        fromAccountId,
        toAccountId,
        date,
        amountCents,
        memo: textOrNull(payload['memo']),
        // Version 1 transfers had none.
        tags: readTags(payload['tags']),
      },
    }
  }
  return null
}
