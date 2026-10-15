import { Injectable, computed, inject, signal } from '@angular/core'
import { Router } from '@angular/router'
import type { Household, User } from '../api/api-types'
import { toApiError } from '../api/http-errors'
import { SessionExpiry } from '../api/session-expiry'
import { LangStore } from '../i18n/lang.store'
import { WINDOW } from '../platform/window.token'
import { ThemeStore } from '../theme/theme.store'
import { clearAppStorage } from './app-storage'
import { AuthApi, type Me } from './auth.api'
import { hasFlag, homePath, type SessionSnapshot } from './entitlements'

/**
 * Who is signed in, read from `GET /api/v1/auth/me` at boot and after every
 * login, sign-up or invitation acceptance. Screens and guards read the
 * computed signals; nothing personal is ever stored outside memory (the
 * session itself is an httpOnly cookie).
 *
 * A 401 from any call while signed in means the session expired or was
 * revoked: the store clears itself and sends the user to /login, quietly
 * (no error toast: logging in again is the whole message).
 */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly api = inject(AuthApi)
  private readonly router = inject(Router)
  private readonly window = inject(WINDOW)
  private readonly theme = inject(ThemeStore)
  private readonly lang = inject(LangStore)

  private readonly _me = signal<Me | null>(null)
  private readonly _unreachable = signal(false)
  private readonly clearHooks = new Set<() => void>()
  private readonly logoutHooks = new Set<() => void>()

  readonly me = this._me.asReadonly()
  /** The boot call could not reach the API (offline or server error). */
  readonly unreachable = this._unreachable.asReadonly()

  readonly user = computed(() => this._me()?.user ?? null)
  readonly household = computed(() => this._me()?.household ?? null)
  readonly membership = computed(() => this._me()?.membership ?? null)
  readonly entitlements = computed(() => this._me()?.entitlements ?? null)
  readonly flags = computed(() => this._me()?.flags ?? [])

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

  constructor() {
    inject(SessionExpiry).listen(() => this.expire())
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
      const failure = toApiError(error)
      this._me.set(null)
      this._unreachable.set(failure.kind === 'offline' || failure.kind === 'server')
    }
  }

  /** Applies a fresh `/auth/me` body, including the user's theme and language. */
  set(me: Me): void {
    this._me.set(me)
    this.theme.hydrate(me.user.theme)
    this.lang.hydrate(me.user.locale)
  }

  /** After `PATCH /me`: the profile changed, the rest of the session did not. */
  patchUser(user: User): void {
    const current = this._me()
    if (current) {
      this._me.set({ ...current, user })
    }
  }

  /** After `PATCH /household` (name, time zone, language). */
  patchHousehold(household: Household): void {
    const current = this._me()
    if (current) {
      this._me.set({ ...current, household })
    }
  }

  /** Other stores register here to drop their cached data on logout. */
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

  /** Ends this session on the server (best effort) and everywhere in the app. */
  async logout(): Promise<void> {
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
  }

  /** Forgets the session, every store's data and the app's storage keys. */
  clear(): void {
    this._me.set(null)
    for (const hook of this.clearHooks) {
      hook()
    }
    clearAppStorage(this.window)
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
