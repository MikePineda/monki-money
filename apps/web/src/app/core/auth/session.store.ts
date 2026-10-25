import { DOCUMENT, DestroyRef, Injectable, computed, inject, signal } from '@angular/core'
import { Router } from '@angular/router'
import type { Household, User } from '../api/api-types'
import { SessionExpiry } from '../api/session-expiry'
import { isClientErrorAnswer } from '../api/tuyau-error'
import { LangStore } from '../i18n/lang.store'
import { OfflineCache } from '../platform/offline-cache'
import { WINDOW } from '../platform/window.token'
import { ThemeStore } from '../theme/theme.store'
import { clearAppStorage } from './app-storage'
import { AuthApi, type Me } from './auth.api'
import { hasFlag, homePath, type SessionSnapshot } from './entitlements'

/** The longest a logout waits for its `beforeLogout` hooks. */
export const BEFORE_LOGOUT_MS = 3_000

/**
 * Who is signed in, read from `GET /api/v1/auth/me` at boot and after every
 * login, sign-up or invitation acceptance. Screens and guards read the
 * computed signals. The session itself is an httpOnly cookie; the last
 * `/auth/me` body is also kept on the device (OfflineCache) so the
 * installed app can start offline.
 *
 * - Boot without an answer (no network, a 5xx) restores that kept session
 *   (`restored`): the shell opens and quick add queues to the outbox. Once
 *   the connection is back (or the app returns to the foreground) it asks
 *   the server again: a fresh session replaces it, a 4xx ends it like an
 *   expiry. A 4xx at boot forgets the kept copy.
 * - A 401 from any call while signed in means the session expired or was
 *   revoked: the store clears itself (the kept copy too) and sends the user
 *   to /login, quietly (no error toast: logging in again is the whole
 *   message). An explicit logout forgets it as well.
 */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly api = inject(AuthApi)
  private readonly router = inject(Router)
  private readonly window = inject(WINDOW)
  private readonly theme = inject(ThemeStore)
  private readonly lang = inject(LangStore)
  private readonly cache = inject(OfflineCache)
  private readonly document = inject(DOCUMENT)

  private readonly _me = signal<Me | null>(null)
  private readonly _unreachable = signal(false)
  private readonly _restored = signal(false)
  private readonly clearHooks = new Set<() => void>()
  private readonly logoutHooks = new Set<() => void>()
  private readonly beforeLogoutHooks = new Set<() => Promise<unknown>>()
  private readonly confirmLogoutHooks = new Set<() => Promise<boolean>>()

  readonly me = this._me.asReadonly()
  /** The boot call could not reach the API (offline or server error). */
  readonly unreachable = this._unreachable.asReadonly()
  /** The session on screen is the one this device kept, not yet confirmed by the server. */
  readonly restored = this._restored.asReadonly()

  readonly user = computed(() => this._me()?.user ?? null)
  readonly household = computed(() => this._me()?.household ?? null)
  readonly membership = computed(() => this._me()?.membership ?? null)
  readonly entitlements = computed(() => this._me()?.entitlements ?? null)
  readonly flags = computed(() => this._me()?.flags ?? [])
  /** The household's members by name and colour (join order); the partner is the other one. */
  readonly members = computed(() => this._me()?.members ?? [])
  readonly partner = computed(() => this._me()?.partner ?? null)

  readonly isAuthenticated = computed(() => this._me() !== null)
  readonly isVerified = computed(() => Boolean(this._me()?.user.emailVerifiedAt))
  readonly hasHousehold = computed(() => this.household() !== null)
  readonly isPendingDeletion = computed(() => this.household()?.status === 'pending_deletion')
  readonly role = computed(() => this.membership()?.role ?? null)
  readonly plan = computed(() => this.household()?.plan ?? null)

  readonly snapshot = computed<SessionSnapshot>(() => ({
    authenticated: this.isAuthenticated(),
    verified: this.isVerified(),
    hasHousehold: this.hasHousehold(),
    pendingDeletion: this.isPendingDeletion(),
    role: this.role(),
    flags: this.flags(),
  }))

  /** Where this person belongs right now (login, verify, household states or the month). */
  readonly homePath = computed(() => homePath(this.snapshot()))

  /** Removes the listeners of a restored session (connection back, app in front). */
  private stopRechecks: (() => void) | null = null

  constructor() {
    inject(SessionExpiry).listen(() => this.expire())
    inject(DestroyRef).onDestroy(() => this.setRestored(false))
  }

  hasFlag(flag: string): boolean {
    return hasFlag(this.flags(), flag)
  }

  /** Boot and refresh: a 401 means "signed out", anything else unexpected marks the API unreachable. */
  async load(): Promise<void> {
    try {
      this.set(await this.api.me())
      this._unreachable.set(false)
    } catch (error) {
      // A 4xx (401 above all) is an answer; no network or a 5xx is not.
      const answered = isClientErrorAnswer(error)
      if (this._restored() && !answered) {
        // Still offline: the restored session stays until the server can tell.
        return
      }
      this._me.set(null)
      this.setRestored(false)
      this._unreachable.set(!answered)
    }
  }

  /**
   * App start: like {@link load}, except that without an answer (offline,
   * a 5xx) the session this device kept is restored, so the app opens
   * offline. A 4xx forgets the kept copy (only that: a pending invitation
   * or a draft stays).
   */
  async boot(): Promise<void> {
    try {
      this.set(await this.api.me())
      this._unreachable.set(false)
    } catch (error) {
      const answered = isClientErrorAnswer(error)
      this._unreachable.set(!answered)
      const kept = answered ? null : this.cache.readSession()
      if (answered) {
        this.cache.clear()
      }
      this._me.set(kept)
      if (kept) {
        this.setRestored(true)
        this.theme.hydrate(kept.user.theme)
        this.lang.hydrate(kept.user.locale)
      }
    }
  }

  private setRestored(restored: boolean): void {
    this._restored.set(restored)
    this.stopRechecks?.()
    this.stopRechecks = null
    if (!restored) {
      return
    }
    const recheck = (): void => {
      if (this.document.visibilityState !== 'hidden') {
        void this.recheck()
      }
    }
    this.window.addEventListener('online', recheck)
    this.document.addEventListener('visibilitychange', recheck)
    this.stopRechecks = () => {
      this.window.removeEventListener('online', recheck)
      this.document.removeEventListener('visibilitychange', recheck)
    }
  }

  /** A restored session meets the server again: confirmed, replaced, or ended (4xx). */
  private async recheck(): Promise<void> {
    try {
      const me = await this.api.me()
      if (this._restored()) {
        this._unreachable.set(false)
        this.set(me)
      }
    } catch (error) {
      if (this._restored() && isClientErrorAnswer(error)) {
        this.expire()
      }
    }
  }

  /**
   * Re-reads `/auth/me` on a screen that names the members (a partner who
   * joined since the app opened); a failure keeps the session as it is.
   */
  async refresh(): Promise<void> {
    try {
      this.set(await this.api.me())
    } catch {
      // Offline or failing: the session stays; a 401 already ended it (SessionExpiry).
    }
  }

  /** Applies a fresh `/auth/me` body, including the user's theme and language. */
  set(me: Me): void {
    const before = this._me()
    this.setRestored(false)
    this._me.set(me)
    this.cache.writeSession(me)
    // Left, created or joined a household: what other stores cached was the old one's.
    if (before && before.household?.id !== me.household?.id) {
      this.dropCachedData()
    }
    this.theme.hydrate(me.user.theme)
    this.lang.hydrate(me.user.locale)
  }

  /** After `PATCH /me`: the profile changed, the rest of the session did not. */
  patchUser(user: User): void {
    const current = this._me()
    if (current) {
      this.keep({ ...current, user })
    }
  }

  /** After `PATCH /household` (name, time zone, language). */
  patchHousehold(household: Household): void {
    const current = this._me()
    if (current) {
      this.keep({ ...current, household })
    }
  }

  /** Other stores register here to drop their cached data on logout and on a household change. */
  onClear(hook: () => void): void {
    this.clearHooks.add(hook)
  }

  /**
   * Data that must go on an explicit logout but survive an expired session
   * (the offline outbox: entries saved on this phone sync after logging in
   * again). Hooks run while the session is still known, before `clear()`.
   */
  onLogout(hook: () => void): void {
    this.logoutHooks.add(hook)
  }

  /**
   * Work that needs the session still open on an explicit logout (forget
   * this device for push): awaited before the API ends the session, best
   * effort, never longer than BEFORE_LOGOUT_MS in all.
   */
  beforeLogout(hook: () => Promise<unknown>): void {
    this.beforeLogoutHooks.add(hook)
  }

  /**
   * Asked before every explicit logout, wherever it is tapped (the offline
   * outbox warns while entries wait, `layouts/outbox/safe-logout.ts`): false
   * keeps the session. A hook that fails counts as yes, so a broken check
   * never locks anyone in.
   */
  confirmLogout(hook: () => Promise<boolean>): void {
    this.confirmLogoutHooks.add(hook)
  }

  /**
   * Ends this session on the server (best effort) and everywhere in the
   * app, once every {@link confirmLogout} hook agreed; resolves with
   * whether it did.
   */
  async logout(): Promise<boolean> {
    for (const confirm of this.confirmLogoutHooks) {
      const agreed = await Promise.resolve()
        .then(confirm)
        .catch(() => true)
      if (!agreed) {
        return false
      }
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    await Promise.race([
      Promise.allSettled([...this.beforeLogoutHooks].map((hook) => Promise.resolve().then(hook))),
      new Promise((resolve) => (timer = setTimeout(resolve, BEFORE_LOGOUT_MS))),
    ])
    clearTimeout(timer)
    try {
      await this.api.logout()
    } catch {
      // Offline or already expired: the local session ends regardless.
    }
    for (const hook of this.logoutHooks) {
      hook()
    }
    this.clear()
    await this.router.navigateByUrl('/login')
    return true
  }

  /** Forgets the session, every store's data and the app's storage keys (the kept session too). */
  clear(): void {
    this._me.set(null)
    this.setRestored(false)
    this.dropCachedData()
    this.cache.clear()
    clearAppStorage(this.window)
  }

  private keep(me: Me): void {
    this._me.set(me)
    this.cache.writeSession(me)
  }

  private dropCachedData(): void {
    for (const hook of this.clearHooks) {
      hook()
    }
  }

  private expire(): void {
    if (!this._me()) {
      return
    }
    const returnUrl = this.router.url
    this.clear()
    void this.router.navigate(['/login'], {
      queryParams: returnUrl && returnUrl !== '/' ? { returnUrl } : {},
    })
  }
}
