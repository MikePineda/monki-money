import { registerLocaleData } from '@angular/common'
import localeEnAu from '@angular/common/locales/en-AU'
import localeEsMx from '@angular/common/locales/es-MX'
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
 * Transloco with ICU messages (plurals, select) through Intl, es/en
 * switchable at runtime, English by default and as the fallback. Locale data
 * is registered for Angular pipes that take a locale; app code formats
 * through domain/ with Intl.
 */
export function provideI18n(): EnvironmentProviders {
  registerLocaleData(localeEnAu, localeFor('en'))
  registerLocaleData(localeEsMx, localeFor('es'))

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
    provideAppInitializer(() => inject(LangStore).init()),
  ])
}
