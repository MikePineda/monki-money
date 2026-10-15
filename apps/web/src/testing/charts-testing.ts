import type { ModuleWithProviders } from '@angular/core'
import type { TranslocoTestingModule } from '@jsverse/transloco'
import chartsEn from '../app/shared/charts/i18n/en.json'
import chartsEs from '../app/shared/charts/i18n/es.json'
import type { AppLang } from '../app/domain/locale'
import { i18nTesting } from './i18n-testing'

/**
 * Transloco for chart specs: the global catalogues plus the real `charts`
 * scope, so summaries and table headers render as users read them.
 * Use with `i18nTestingProviders()`.
 */
export function chartsI18nTesting(
  lang: AppLang = 'en'
): ModuleWithProviders<TranslocoTestingModule> {
  return i18nTesting({ lang, scopes: { 'charts/en': chartsEn, 'charts/es': chartsEs } })
}
