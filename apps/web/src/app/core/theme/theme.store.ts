import { DOCUMENT, Injectable, InjectionToken, computed, inject, signal } from '@angular/core'
import { readPreference, writePreference } from '../platform/local-preference'
import { WINDOW } from '../platform/window.token'

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

/** Keep in sync with public/theme-boot.js, which reads it before first paint. */
export const THEME_STORAGE_KEY = 'mm:theme'
export const DARK_SCHEME_QUERY = '(prefers-color-scheme: dark)'

/**
 * Where a user's explicit choice is saved beyond this device. Not provided
 * yet: the session package wires it to `PATCH /api/v1/me { theme }`.
 */
export interface ThemePersistence {
  save(preference: ThemePreference): void | Promise<void>
}

export const THEME_PERSISTENCE = new InjectionToken<ThemePersistence>('THEME_PERSISTENCE')

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}

/**
 * Light / dark / system theme. Applies `data-theme` on <html> (the tokens in
 * styles.css switch on it), pins the matching theme-color meta for an
 * explicit choice, and mirrors the choice in localStorage for theme-boot.js.
 */
@Injectable({ providedIn: 'root' })
export class ThemeStore {
  private readonly document = inject(DOCUMENT)
  private readonly window = inject(WINDOW)
  private readonly persistence = inject(THEME_PERSISTENCE, { optional: true })

  private readonly systemDark = signal(false)
  private readonly _preference = signal<ThemePreference>('system')

  readonly preference = this._preference.asReadonly()
  readonly resolved = computed<ResolvedTheme>(() => {
    const preference = this._preference()
    if (preference === 'system') {
      return this.systemDark() ? 'dark' : 'light'
    }
    return preference
  })

  constructor() {
    const query = this.window.matchMedia?.(DARK_SCHEME_QUERY)
    if (query) {
      this.systemDark.set(query.matches)
      query.addEventListener('change', (event) => this.systemDark.set(event.matches))
    }
    const stored = readPreference(this.window, THEME_STORAGE_KEY)
    this.apply(isThemePreference(stored) ? stored : 'system')
  }

  /** A choice made in this app: applied, stored locally and sent to the persistence hook. */
  setPreference(preference: ThemePreference): void {
    this.apply(preference)
    void this.persistence?.save(preference)
  }

  /** A choice that came from the server (for example `GET /me`): applied, not sent back. */
  hydrate(preference: ThemePreference): void {
    this.apply(preference)
  }

  private apply(preference: ThemePreference): void {
    this._preference.set(preference)
    writePreference(this.window, THEME_STORAGE_KEY, preference === 'system' ? null : preference)

    const root = this.document.documentElement
    if (preference === 'system') {
      root.removeAttribute('data-theme')
    } else {
      root.setAttribute('data-theme', preference)
    }

    const metas = this.document.head.querySelectorAll<HTMLMetaElement>(
      'meta[name="theme-color"][data-scheme]'
    )
    for (const meta of metas) {
      const scheme = meta.dataset['scheme']
      if (preference === 'system') {
        meta.setAttribute('media', `(prefers-color-scheme: ${scheme})`)
      } else {
        meta.setAttribute('media', scheme === preference ? 'all' : 'not all')
      }
    }
  }
}
