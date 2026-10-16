import { isLocale, type Locale } from '@monkimoney/shared'

/**
 * The language a request is answered in (user -> Accept-Language ->
 * household -> default, resolved by the i18n middleware), narrowed to the
 * app's locales: what stored, per-language content (monthly insights) is
 * keyed by.
 */
export function requestLocale(ctx: { i18n: { locale: string } }): Locale {
  return isLocale(ctx.i18n.locale) ? ctx.i18n.locale : 'en'
}
