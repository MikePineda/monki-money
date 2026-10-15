/**
 * UI languages and the locale each one formats with. Pure: no Angular.
 * Adding a third language is one row here plus its catalogues.
 */
export const APP_LANGS = ['en', 'es'] as const

export type AppLang = (typeof APP_LANGS)[number]

/** Owner decision: English by default, Spanish available. */
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
