import { provideTranslocoScope } from '@jsverse/transloco'

/**
 * The `charts` Transloco scope (frame chrome, table headers, summaries).
 * Every chart component provides it, so its catalogue loads with the
 * charts chunk and never with the initial bundle.
 */
export function provideChartsI18n() {
  return provideTranslocoScope({
    scope: 'charts',
    loader: { en: () => import('./i18n/en.json'), es: () => import('./i18n/es.json') },
  })
}
