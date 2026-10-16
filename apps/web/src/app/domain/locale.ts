/**
 * UI languages and the locale each one formats with. Pure: no Angular.
 * Adding a third language is one row here plus its catalogues.
 */
export const APP_LANGS = ['en', 'es'] as const

export type AppLang = (typeof APP_LANGS)[number]

/** Owner decision: English by default (a device in neither language), Spanish available. */
export const DEFAULT_LANG: AppLang = 'en'

const LOCALE_BY_LANG: Record<AppLang, string> = {
  en: 'en-AU',
  es: 'es-MX',
}

export function isAppLang(value: unknown): value is AppLang {
  return typeof value === 'string' && (APP_LANGS as readonly string[]).includes(value)
}

/** BCP 47 locale used by every Intl formatter for a UI language. */
export function localeFor(lang: AppLang): string {
  return LOCALE_BY_LANG[lang]
}

/**
 * The first language for a device that has not chosen one in the app: the
 * first of the device's preferred languages (`navigator.languages`, BCP 47
 * tags, in order) that the app speaks decides, so an es-MX or es-419 phone
 * starts in Spanish; a device with none of them gets the default.
 */
export function deviceLang(languages: readonly string[]): AppLang {
  for (const tag of languages) {
    const primary = tag.split('-')[0]?.toLowerCase()
    if (isAppLang(primary)) {
      return primary
    }
  }
  return DEFAULT_LANG
}
