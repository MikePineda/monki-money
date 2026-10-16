import { DOCUMENT, Injectable, InjectionToken, computed, inject, signal } from '@angular/core'
import { TranslocoService } from '@jsverse/transloco'
import { firstValueFrom } from 'rxjs'
import { APP_LANGS, deviceLang, isAppLang, localeFor, type AppLang } from '../../domain/locale'
import { readPreference, writePreference } from '../platform/local-preference'
import { WINDOW } from '../platform/window.token'

export const LANG_STORAGE_KEY = 'mm:lang'

/**
 * Where a user's language choice is saved beyond this device. Not provided
 * yet: the session package wires it to `PATCH /api/v1/me { locale }`.
 */
export interface LangPersistence {
  save(lang: AppLang): void | Promise<void>
}

export const LANG_PERSISTENCE = new InjectionToken<LangPersistence>('LANG_PERSISTENCE')

/**
 * The UI language (en / es) and its formatting locale (en-AU / es-MX).
 * Switching is live: Transloco re-renders, <html lang> follows, and the
 * choice is mirrored in localStorage for the next start.
 *
 * The start language is the stored choice, else the device's
 * (`navigator.languages`, see `deviceLang`), so a Spanish phone sees
 * Spanish from the first screen and signs up in Spanish. The device
 * language is not stored: only a choice (or the account's language) is.
 */
@Injectable({ providedIn: 'root' })
export class LangStore {
  private readonly transloco = inject(TranslocoService)
  private readonly document = inject(DOCUMENT)
  private readonly window = inject(WINDOW)
  private readonly persistence = inject(LANG_PERSISTENCE, { optional: true })

  private readonly _lang = signal<AppLang>(this.startLang())

  readonly available = APP_LANGS
  readonly lang = this._lang.asReadonly()
  readonly locale = computed(() => localeFor(this._lang()))

  /** Activates the start language and waits for its catalogue (app initializer). */
  async init(): Promise<void> {
    this.activate(this._lang())
    await firstValueFrom(this.transloco.load(this._lang()))
  }

  /** A choice made in this app: applied, stored locally and sent to the persistence hook. */
  setLang(lang: AppLang): void {
    this.apply(lang)
    void this.persistence?.save(lang)
  }

  /** A language that came from the server: applied, not sent back. */
  hydrate(lang: AppLang): void {
    this.apply(lang)
  }

  /** Applied and remembered on this device. */
  private apply(lang: AppLang): void {
    this.activate(lang)
    writePreference(this.window, LANG_STORAGE_KEY, lang)
  }

  private activate(lang: AppLang): void {
    this._lang.set(lang)
    this.transloco.setActiveLang(lang)
    this.document.documentElement.lang = localeFor(lang)
  }

  private startLang(): AppLang {
    const stored = readPreference(this.window, LANG_STORAGE_KEY)
    if (isAppLang(stored)) {
      return stored
    }
    const navigator = this.window.navigator
    const languages = navigator?.languages?.length ? navigator.languages : [navigator?.language]
    return deviceLang(languages.filter((tag): tag is string => typeof tag === 'string'))
  }
}
