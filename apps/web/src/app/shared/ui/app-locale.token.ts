import { InjectionToken, signal, type Signal } from '@angular/core'
import { DEFAULT_LANG, localeFor } from '../../domain/locale'

/**
 * The active formatting locale (es-MX or en-AU) for ui-kit components that
 * format money or months. ui-kit components never inject stores; core
 * provides this token from the language store, and tests get the default.
 */
export const APP_LOCALE = new InjectionToken<Signal<string>>('APP_LOCALE', {
  providedIn: 'root',
  factory: () => signal(localeFor(DEFAULT_LANG)).asReadonly(),
})
