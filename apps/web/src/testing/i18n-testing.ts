import {
  Injectable,
  InjectionToken,
  inject,
  type EnvironmentProviders,
  type ModuleWithProviders,
} from '@angular/core'
import {
  TranslocoService,
  TranslocoTestingModule,
  provideTranslocoMissingHandler,
  provideTranslocoTranspiler,
  type LoadOptions,
  type Translation,
  type TranslocoMissingHandler,
  type TranslocoMissingHandlerData,
} from '@jsverse/transloco'
import { throwError, type Observable } from 'rxjs'
import en from '../../public/i18n/en.json'
import es from '../../public/i18n/es.json'
import { IcuTranspiler } from '../app/core/i18n/icu.transpiler'
import type { AppLang } from '../app/domain/locale'
import { scopeCataloguesByPath } from './i18n-scopes'

export interface I18nTestingOptions {
  lang?: AppLang
  /**
   * Extra catalogues keyed like Transloco paths (`{ 'probe/en': {...} }`).
   * Every app scope is already preloaded (SCOPE_CATALOGUES), so specs
   * rarely need this.
   */
  scopes?: Record<string, Translation>
}

/** The Transloco paths a spec preloaded (`'en'`, `'goals/es'`...). */
const PRELOADED_PATHS = new InjectionToken<ReadonlySet<string>>('PRELOADED_PATHS')

/**
 * Refuses to load a catalogue through a component's lazy `import()`. In a
 * spec every catalogue is preloaded, so a lazy load means a scope missing
 * from SCOPE_CATALOGUES: it would render empty text until the import
 * settles and race the spec, so it fails at once instead.
 */
@Injectable()
class PreloadedOnlyTranslocoService extends TranslocoService {
  private readonly preloaded = inject(PRELOADED_PATHS)

  override load(path: string, options: LoadOptions = {}): Observable<Translation> {
    if (options.inlineLoader && !this.preloaded.has(path)) {
      return throwError(
        () =>
          new Error(
            `Transloco catalogue "${path}" is not preloaded, so it would load lazily and ` +
              'race the spec: add its scope to SCOPE_CATALOGUES in src/testing/i18n-scopes.ts'
          )
      )
    }
    return super.load(path, options)
  }
}

/** A key no catalogue has fails the spec instead of rendering as raw text. */
@Injectable()
class FailOnMissingKey implements TranslocoMissingHandler {
  handle(key: string, data: TranslocoMissingHandlerData): never {
    throw new Error(`Missing translation for "${key}" (active language "${data.activeLang}")`)
  }
}

/**
 * Transloco for component specs: the real global catalogues and every
 * scope catalogue in both languages, preloaded before the first render (no
 * lazy `import()`, so copy is there from the first frame and a language
 * switch never waits), ICU messages enabled, and loud failures for a
 * missing key or a scope that is not preloaded.
 * Use: `imports: [i18nTesting()]`, `providers: [i18nTestingProviders()]`.
 */
export function i18nTesting(
  options: I18nTestingOptions = {}
): ModuleWithProviders<TranslocoTestingModule> {
  const langs: Record<string, Translation> = {
    en,
    es,
    ...scopeCataloguesByPath(),
    ...options.scopes,
  }
  const testing = TranslocoTestingModule.forRoot({
    langs,
    translocoConfig: {
      availableLangs: ['en', 'es'],
      defaultLang: options.lang ?? 'en',
      reRenderOnLangChange: true,
    },
    preloadLangs: true,
  })
  return {
    ngModule: testing.ngModule,
    providers: [
      ...(testing.providers ?? []),
      { provide: PRELOADED_PATHS, useValue: new Set(Object.keys(langs)) },
      { provide: TranslocoService, useClass: PreloadedOnlyTranslocoService },
      provideTranslocoMissingHandler(FailOnMissingKey),
    ],
  }
}

export function i18nTestingProviders(): EnvironmentProviders {
  return provideTranslocoTranspiler(IcuTranspiler)
}
