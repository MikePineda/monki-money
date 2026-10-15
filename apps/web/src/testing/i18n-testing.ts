import type { EnvironmentProviders, ModuleWithProviders } from '@angular/core'
import {
  TranslocoTestingModule,
  provideTranslocoTranspiler,
  type Translation,
} from '@jsverse/transloco'
import en from '../../public/i18n/en.json'
import es from '../../public/i18n/es.json'
import { IcuTranspiler } from '../app/core/i18n/icu.transpiler'
import type { AppLang } from '../app/domain/locale'

export interface I18nTestingOptions {
  lang?: AppLang
  /** Scope catalogues keyed like Transloco paths, for example `{ 'month/en': {...} }`. */
  scopes?: Record<string, Translation>
}

/**
 * Transloco for component specs, with the real global catalogues (so a
 * missing key shows up in the rendered text) and ICU messages enabled.
 * Use: `imports: [i18nTesting()]`, `providers: [i18nTestingProviders()]`.
 */
export function i18nTesting(
  options: I18nTestingOptions = {}
): ModuleWithProviders<TranslocoTestingModule> {
  return TranslocoTestingModule.forRoot({
    langs: { en, es, ...options.scopes },
    translocoConfig: {
      availableLangs: ['en', 'es'],
      defaultLang: options.lang ?? 'en',
      reRenderOnLangChange: true,
      missingHandler: { logMissingKey: false },
    },
    preloadLangs: true,
  })
}

export function i18nTestingProviders(): EnvironmentProviders {
  return provideTranslocoTranspiler(IcuTranspiler)
}
