import {
  DOCUMENT,
  DestroyRef,
  Injectable,
  Injector,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core'
import { marker } from '@jsverse/transloco-keys-manager/marker'
import type { YearMonth } from '../../domain/month'
import {
  backoffMs,
  deserialize,
  discard,
  enqueue,
  markFailed,
  markSynced,
  markSyncing,
  nextToSync,
  reconcile,
  replace,
  retry,
  serialize,
  type OutboxEntry,
  type OutboxItem,
  type OutboxKind,
} from '../../domain/outbox'
import type { Transfer } from '../api/api-types'
import { SessionStore } from '../auth/session.store'
import { TransactionsApi } from '../ledger/transactions.api'
import { MonthStore } from '../month/month.store'
import { CLOCK } from '../platform/clock.token'
import { writePreference } from '../platform/local-preference'
import { WINDOW } from '../platform/window.token'
import { ToastStore } from '../ui/toast.store'
import { syncResult, type SyncResult } from './sync-result'

/** localStorage key prefix, one outbox per person on this device: `outbox:<userId>`. */
export const OUTBOX_KEY = 'outbox:'

/** A global key: the toast shows on whatever screen the person is on. */
const SYNCED_TOAST = marker('sync.synced')

/** Synced entries remembered for "Undo" (the toast is long gone after a few). */
const CREATED_KEPT = 50

/** What "Undo" came to: the entry (or the row it became) is gone, or this tab never knew it. */
export type UndoOutcome = 'removed' | 'missing'

/**
 * An entry that reached the API and the ledger rows it became (a transfer's
 * two legs); none when the API already had it (a 409).
 */
export interface SyncedEntry {
  entry: OutboxEntry
  rows: readonly SyncedRow[]
}

/** A ledger row as both creates answer it (a quick entry, or a leg of a transfer). */
export type SyncedRow = Transfer['legs'][number]

/** The row a synced entry created on the API, so "Undo" can delete it. */
interface CreatedRow {
  kind: OutboxKind
  id: number
  month: YearMonth
}

/**
 * The offline outbox (domain/outbox.ts) of the person signed in: creates
 * quick add could not send, kept in localStorage under `outbox:<userId>`
 * (written synchronously on every change, so an entry is on disk before
 * the screen says "saved") and synced to the API one at a time with the
 * client id they were created with (idempotent: a replay never makes a
 * second row).
 *
 * - Loads when a person signs in (also at app start, once the session is
 *   known); an expired session keeps the stored outbox for the next login,
 *   an explicit logout deletes it from the device (the shell warns first
 *   while entries wait, `layouts/outbox/safe-logout.ts`).
 * - Two open tabs share the device copy: every change starts from it
 *   (another tab may have written since) and a `storage` event reloads it,
 *   so neither tab drops the other's newest entry. Both may sync the same
 *   entry; the client id makes that harmless.
 * - When localStorage refuses the write (full quota, private mode) the
 *   outbox keeps working from memory until the app closes and says so
 *   (`isPersisted`); the next write that succeeds stores everything.
 * - Syncs on sign-in, when the connection comes back (`online`), when the
 *   app returns to the foreground, after every quick-add save, and on a
 *   backoff timer (1 s, 2 s, 4 s… 60 s) while entries wait. Never while
 *   signed out, and the automatic triggers skip while the device is offline.
 * - A synced entry refreshes its month (MonthStore), is handed with its rows
 *   to whoever listens (`onSynced`: quick add ranks them at once) and a
 *   batch that synced anything says so in a toast ("Synced 2 entries").
 * - "Undo" drops a queued entry, or deletes the row it became once synced.
 * - An entry being edited in quick add is held: it does not sync until it
 *   is replaced or released.
 */
@Injectable({ providedIn: 'root' })
export class OutboxStore {
  private readonly api = inject(TransactionsApi)
  private readonly toasts = inject(ToastStore)
  private readonly session = inject(SessionStore)
  private readonly window = inject(WINDOW)
  private readonly document = inject(DOCUMENT)
  private readonly clock = inject(CLOCK)
  private readonly injector = inject(Injector)
  private readonly destroyRef = inject(DestroyRef)

  private readonly _entries = signal<OutboxEntry[]>([])
  private readonly _syncing = signal(false)
  private readonly _online = signal(true)
  private readonly _persisted = signal(true)
  /** Bumped when the session ends, so the same person signing in again reloads. */
  private readonly generation = signal(0)

  /** Everything not on the server yet, oldest first. */
  readonly entries = this._entries.asReadonly()
  /** Entries waiting for (or in) a sync. */
  readonly pendingCount = computed(
    () => this._entries().filter((entry) => entry.status !== 'failed').length
  )
  /** Entries the API refused; they wait for a retry, an edit or a discard. */
  readonly failedCount = computed(
    () => this._entries().filter((entry) => entry.status === 'failed').length
  )
  readonly isSyncing = this._syncing.asReadonly()
  readonly isOnline = this._online.asReadonly()
  /** False while the device refuses to store the outbox: it lives in memory until the app closes. */
  readonly isPersisted = this._persisted.asReadonly()

  /** The person whose outbox is loaded (null while signed out). */
  private owner: number | null = null
  private readonly held = new Set<string>()
  private readonly created = new Map<string, CreatedRow>()
  private readonly syncedListeners = new Set<(synced: SyncedEntry) => void>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private running: Promise<void> | null = null
  private rerun = false
  private started = false

  constructor() {
    this.session.onClear(() => this.unload())
    this.session.onLogout(() => this.forget())
    this.destroyRef.onDestroy(() => this.clearTimer())
  }

  /** Called once at app start: follows the session, the connection and the other tabs. */
  start(): void {
    if (this.started) {
      return
    }
    this.started = true
    this.refreshOnline()

    const userId = computed(() => this.session.user()?.id ?? null)
    effect(
      () => {
        const id = userId()
        this.generation()
        untracked(() => this.load(id))
      },
      { injector: this.injector }
    )

    const onOnline = (): void => {
      this._online.set(true)
      void this.autoFlush()
    }
    const onOffline = (): void => {
      this._online.set(false)
      this.clearTimer()
    }
    const onVisibility = (): void => {
      if (this.document.visibilityState === 'visible') {
        void this.autoFlush()
      }
    }
    const onStorage = (event: StorageEvent): void => this.onStorage(event)
    this.window.addEventListener('online', onOnline)
    this.window.addEventListener('offline', onOffline)
    this.window.addEventListener('storage', onStorage)
    this.document.addEventListener('visibilitychange', onVisibility)
    this.destroyRef.onDestroy(() => {
      this.window.removeEventListener('online', onOnline)
      this.window.removeEventListener('offline', onOffline)
      this.window.removeEventListener('storage', onStorage)
      this.document.removeEventListener('visibilitychange', onVisibility)
    })
  }

  /** Called for every entry that syncs, with the rows it became; the answer stops listening. */
  onSynced(listener: (synced: SyncedEntry) => void): () => void {
    this.syncedListeners.add(listener)
    return () => this.syncedListeners.delete(listener)
  }

  entry(id: string): OutboxEntry | null {
    return this._entries().find((entry) => entry.id === id) ?? null
  }

  /** Queues a create that could not reach the API; it is on disk when this returns (see isPersisted). */
  enqueue(item: OutboxItem): void {
    if (this.owner === null) {
      return
    }
    this.update((entries) => enqueue(entries, item, this.clock()))
    this.schedule()
  }

  /**
   * Tries every waiting entry now (one at a time, oldest first). A call
   * while a sync runs joins it, and the sync goes round once more at the end
   * for whatever changed meanwhile.
   */
  flush(): Promise<void> {
    if (this.running) {
      this.rerun = true
      return this.running
    }
    this.running = (async () => {
      do {
        this.rerun = false
        await this.drain()
      } while (this.rerun)
    })().finally(() => {
      this.running = null
      this.schedule()
    })
    return this.running
  }

  /** "Retry" (one entry, or all failed ones), then syncs. */
  retry(id?: string): Promise<void> {
    this.update((entries) => retry(entries, id))
    return this.flush()
  }

  /** "Discard": the entry never reaches the API. */
  discard(id: string): void {
    this.held.delete(id)
    this.update((entries) => discard(entries, id))
  }

  /**
   * "Undo" on the "Saved offline" toast: a queued entry is dropped; one
   * that synced meanwhile has the row it created deleted on the API (like
   * the online undo); one on its way is waited for first. Rejects when that
   * delete fails (the undo can be tried again). `missing` when this tab
   * never knew the entry or already undid it.
   */
  async undo(id: string): Promise<UndoOutcome> {
    if (this.entry(id)?.status === 'syncing' && this.running) {
      await this.running.catch(() => undefined)
    }
    if (this.entry(id)) {
      this.discard(id)
      return 'removed'
    }
    const created = this.created.get(id)
    if (!created) {
      return 'missing'
    }
    if (created.kind === 'transfer') {
      await this.api.removeTransfer(created.id)
    } else {
      await this.api.remove(created.id)
    }
    this.created.delete(id)
    this.injector.get(MonthStore).invalidate(created.month)
    return 'removed'
  }

  /** Quick add is editing this entry: it does not sync meanwhile. */
  hold(id: string): void {
    this.held.add(id)
  }

  /** The edit ended without saving: the entry syncs as it was. */
  release(id: string): Promise<void> {
    this.held.delete(id)
    return this.flush()
  }

  /** The edit was saved: the entry takes the new body (same client id) and syncs. */
  replace(id: string, item: OutboxItem): Promise<void> {
    this.held.delete(id)
    this.update((entries) => replace(entries, id, item))
    return this.flush()
  }

  /* ---------------------------------------------------------------- sync */

  private canSync(): boolean {
    return (
      this.owner !== null &&
      this.session.isAuthenticated() &&
      this.session.hasHousehold() &&
      !this.session.isPendingDeletion()
    )
  }

  private refreshOnline(): boolean {
    const online = this.window.navigator.onLine !== false
    this._online.set(online)
    return online
  }

  /** Automatic triggers (connection back, foreground, timer, sign-in) skip while offline. */
  private autoFlush(): Promise<void> {
    return this.refreshOnline() ? this.flush() : Promise.resolve()
  }

  private async drain(): Promise<void> {
    const owner = this.owner
    if (!this.canSync() || !nextToSync(this._entries(), this.held)) {
      return
    }
    this.clearTimer()
    this._syncing.set(true)
    let synced = 0
    try {
      for (;;) {
        // Another tab may have synced or discarded entries since: pick from the device copy.
        const entry = nextToSync(this.current(), this.held)
        if (!entry || owner !== this.owner || !this.canSync()) {
          break
        }
        this.update((entries) => markSyncing(entries, entry.id))
        const { result, rowId, rows } = await this.send(entry)
        if (owner !== this.owner) {
          // The session changed while the request was out: not this outbox any more.
          break
        }
        if (result.outcome === 'synced') {
          this.update((entries) => markSynced(entries, entry.id))
          this.remember(entry, rowId)
          this.injector.get(MonthStore).invalidate(entry.month)
          for (const listener of this.syncedListeners) {
            listener({ entry, rows })
          }
          synced += 1
          continue
        }
        const retryable = result.outcome === 'retry'
        this.update((entries) => markFailed(entries, entry.id, result.error, retryable))
        if (retryable) {
          break
        }
      }
    } finally {
      this._syncing.set(false)
    }
    if (synced > 0) {
      this.toasts.show({ messageKey: SYNCED_TOAST, params: { count: synced } })
    }
  }

  /**
   * One create on the API; resolves with what it came to, the id of what it
   * made (a transfer's, for "Undo") and its ledger rows.
   */
  private async send(
    entry: OutboxEntry
  ): Promise<{ result: SyncResult; rowId: number | null; rows: SyncedRow[] }> {
    try {
      if (entry.kind === 'transfer') {
        const transfer = await this.api.transfer(entry.payload)
        return { result: { outcome: 'synced' }, rowId: transfer.id, rows: transfer.legs }
      }
      const row = await this.api.quick(entry.payload)
      return { result: { outcome: 'synced' }, rowId: row.id, rows: [row] }
    } catch (error) {
      // A 409 counts as synced, without a row to undo.
      return { result: syncResult(error), rowId: null, rows: [] }
    }
  }

  /** The row a synced entry became, for "Undo" while its toast may still be up. */
  private remember(entry: OutboxEntry, rowId: number | null): void {
    if (rowId === null) {
      return
    }
    this.created.set(entry.id, { kind: entry.kind, id: rowId, month: entry.month })
    for (const id of this.created.keys()) {
      if (this.created.size <= CREATED_KEPT) {
        break
      }
      this.created.delete(id)
    }
  }

  /** While entries wait and the device is online, the next try comes after the backoff. */
  private schedule(): void {
    this.clearTimer()
    const next = nextToSync(this._entries(), this.held)
    if (!next || !this.canSync() || !this.refreshOnline()) {
      return
    }
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.autoFlush()
    }, backoffMs(next.attempts))
  }

  private clearTimer(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
  }

  /* -------------------------------------------------------- persistence */

  private key(userId: number): string {
    return `${OUTBOX_KEY}${userId}`
  }

  /** The device copy of the owner's outbox; null when there is no owner or it cannot be read. */
  private readDevice(): OutboxEntry[] | null {
    if (this.owner === null) {
      return null
    }
    try {
      return deserialize(this.window.localStorage.getItem(this.key(this.owner)))
    } catch {
      return null
    }
  }

  /**
   * What a change starts from: the device copy, which another tab may have
   * written since this one last looked (entries this tab is sending stay
   * `syncing`). While the device refuses this tab's writes its copy is
   * behind, so memory is the outbox.
   */
  private current(): OutboxEntry[] {
    const stored = this._persisted() ? this.readDevice() : null
    return stored === null ? this._entries() : reconcile(stored, this._entries(), false)
  }

  /** Applies a change to the current outbox and writes it through, synchronously. */
  private update(change: (entries: OutboxEntry[]) => OutboxEntry[]): void {
    this.persist(change(this.current()))
  }

  /** Another tab wrote this person's outbox (or cleared the storage): take its copy. */
  private onStorage(event: StorageEvent): void {
    if (this.owner === null || (event.key !== null && event.key !== this.key(this.owner))) {
      return
    }
    const stored = this.readDevice()
    if (stored === null) {
      return
    }
    // Entries this device never stored stay in memory next to the other tab's.
    this._entries.set(reconcile(stored, this._entries(), !this._persisted()))
    this.schedule()
  }

  /** The signed-in person changed: their outbox from this device, then a sync. */
  private load(userId: number | null): void {
    if (userId === this.owner) {
      return
    }
    this.clearTimer()
    this.held.clear()
    this.created.clear()
    this.owner = userId
    this._persisted.set(true)
    this._entries.set(userId === null ? [] : (this.readDevice() ?? []))
    if (userId !== null) {
      void this.autoFlush()
    }
  }

  /** Any end of the session: nothing stays in memory (the device copy stays). */
  private unload(): void {
    this.clearTimer()
    this.held.clear()
    this.created.clear()
    this.owner = null
    this._persisted.set(true)
    this._entries.set([])
    this.generation.update((value) => value + 1)
  }

  /** Explicit logout: the outbox is deleted from this device too. */
  private forget(): void {
    if (this.owner !== null) {
      writePreference(this.window, this.key(this.owner), null)
    }
    this.unload()
  }

  private persist(entries: OutboxEntry[]): void {
    this._entries.set(entries)
    if (this.owner !== null) {
      const raw = entries.length > 0 ? serialize(entries) : null
      this._persisted.set(writePreference(this.window, this.key(this.owner), raw))
    }
  }
}
