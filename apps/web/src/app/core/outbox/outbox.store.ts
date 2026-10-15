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
import {
  backoffMs,
  deserialize,
  discard,
  enqueue,
  markFailed,
  markSynced,
  markSyncing,
  nextToSync,
  replace,
  retry,
  serialize,
  type OutboxEntry,
  type OutboxItem,
} from '../../domain/outbox'
import { SessionStore } from '../auth/session.store'
import { TransactionsApi } from '../ledger/transactions.api'
import { MonthStore } from '../month/month.store'
import { CLOCK } from '../platform/clock.token'
import { readPreference, writePreference } from '../platform/local-preference'
import { WINDOW } from '../platform/window.token'
import { ToastStore } from '../ui/toast.store'
import { syncResult, type SyncResult } from './sync-result'

/** localStorage key prefix, one outbox per person on this device: `outbox:<userId>`. */
export const OUTBOX_KEY = 'outbox:'

/** A global key: the toast shows on whatever screen the person is on. */
const SYNCED_TOAST = marker('sync.synced')

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
 *   an explicit logout deletes it from the device.
 * - Syncs on sign-in, when the connection comes back (`online`), when the
 *   app returns to the foreground, after every quick-add save, and on a
 *   backoff timer (1 s, 2 s, 4 s… 60 s) while entries wait. Never while
 *   signed out, and the automatic triggers skip while the device is offline.
 * - A synced entry refreshes its month (MonthStore) and a batch that synced
 *   anything says so in a toast ("Synced 2 entries").
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

  /** The person whose outbox is loaded (null while signed out). */
  private owner: number | null = null
  private readonly held = new Set<string>()
  private timer: ReturnType<typeof setTimeout> | undefined
  private running: Promise<void> | null = null
  private rerun = false
  private started = false

  constructor() {
    this.session.onClear(() => this.unload())
    this.session.onLogout(() => this.forget())
    this.destroyRef.onDestroy(() => this.clearTimer())
  }

  /** Called once at app start: follows the session and the connection. */
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
    this.window.addEventListener('online', onOnline)
    this.window.addEventListener('offline', onOffline)
    this.document.addEventListener('visibilitychange', onVisibility)
    this.destroyRef.onDestroy(() => {
      this.window.removeEventListener('online', onOnline)
      this.window.removeEventListener('offline', onOffline)
      this.document.removeEventListener('visibilitychange', onVisibility)
    })
  }

  entry(id: string): OutboxEntry | null {
    return this._entries().find((entry) => entry.id === id) ?? null
  }

  /** Queues a create that could not reach the API; it is on disk when this returns. */
  enqueue(item: OutboxItem): void {
    if (this.owner === null) {
      return
    }
    this.persist(enqueue(this._entries(), item, this.clock()))
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
    this.persist(retry(this._entries(), id))
    return this.flush()
  }

  /** "Discard": the entry never reaches the API. */
  discard(id: string): void {
    this.held.delete(id)
    this.persist(discard(this._entries(), id))
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
    this.persist(replace(this._entries(), id, item))
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
        const entry = nextToSync(this._entries(), this.held)
        if (!entry || owner !== this.owner || !this.canSync()) {
          break
        }
        this.persist(markSyncing(this._entries(), entry.id))
        const result = await this.send(entry)
        if (owner !== this.owner) {
          // The session changed while the request was out: not this outbox any more.
          break
        }
        if (result.outcome === 'synced') {
          this.persist(markSynced(this._entries(), entry.id))
          this.injector.get(MonthStore).invalidate(entry.month)
          synced += 1
          continue
        }
        const retryable = result.outcome === 'retry'
        this.persist(markFailed(this._entries(), entry.id, result.error, retryable))
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

  private async send(entry: OutboxEntry): Promise<SyncResult> {
    try {
      if (entry.kind === 'transfer') {
        await this.api.transfer(entry.payload)
      } else {
        await this.api.quick(entry.payload)
      }
      return { outcome: 'synced' }
    } catch (error) {
      return syncResult(error)
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

  /** The signed-in person changed: their outbox from this device, then a sync. */
  private load(userId: number | null): void {
    if (userId === this.owner) {
      return
    }
    this.clearTimer()
    this.held.clear()
    this.owner = userId
    this._entries.set(
      userId === null ? [] : deserialize(readPreference(this.window, this.key(userId)))
    )
    if (userId !== null) {
      void this.autoFlush()
    }
  }

  /** Any end of the session: nothing stays in memory (the device copy stays). */
  private unload(): void {
    this.clearTimer()
    this.held.clear()
    this.owner = null
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
      writePreference(
        this.window,
        this.key(this.owner),
        entries.length > 0 ? serialize(entries) : null
      )
    }
  }
}
