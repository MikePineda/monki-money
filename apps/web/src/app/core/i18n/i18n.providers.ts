import { registerLocaleData } from '@angular/common'
import {
  inject,
  isDevMode,
  makeEnvironmentProviders,
  provideAppInitializer,
  type EnvironmentProviders,
  type Provider,
} from '@angular/core'
import { provideTransloco, provideTranslocoTranspiler } from '@jsverse/transloco'
import { APP_LANGS, DEFAULT_LANG, localeFor } from '../../domain/locale'
import { APP_LOCALE } from '../../shared/ui/app-locale.token'
import { IcuTranspiler } from './icu.transpiler'
import { LangStore } from './lang.store'
import { TranslocoFetchLoader } from './transloco-fetch.loader'

/** ui-kit components format with the active language's locale. */
export function provideAppLocale(): Provider {
  return { provide: APP_LOCALE, useFactory: () => inject(LangStore).locale }
}

/**
 * Angular's locale data for both languages, from their own chunks: start-up
 * waits for the first catalogue anyway, so loading them beside it keeps them
 * out of the initial bundle without delaying the first screen.
 */
async function registerAppLocales(): Promise<void> {
  const [enAu, esMx] = await Promise.all([
    import('@angular/common/locales/en-AU'),
    import('@angular/common/locales/es-MX'),
  ])
  registerLocaleData(enAu.default, localeFor('en'))
  registerLocaleData(esMx.default, localeFor('es'))
}

/**
 * Transloco with ICU messages (plurals, select) through Intl, es/en
 * switchable at runtime, English by default and as the fallback. Locale data
 * is registered before the first screen for Angular pipes that take a
 * locale; app code formats through domain/ with Intl.
 */
export function provideI18n(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideTransloco({
      config: {
        availableLangs: [...APP_LANGS],
        defaultLang: DEFAULT_LANG,
        fallbackLang: DEFAULT_LANG,
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
        missingHandler: { useFallbackTranslation: true, logMissingKey: isDevMode() },
      },
      loader: TranslocoFetchLoader,
    }),
    provideTranslocoTranspiler(IcuTranspiler),
    provideAppLocale(),
    provideAppInitializer(async () => {
      await Promise.all([inject(LangStore).init(), registerAppLocales()])
    }),
  ])
}
