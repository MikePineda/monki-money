import { provideTranslocoScope } from '@jsverse/transloco'

/** The `rules` catalogue: the merchant rules screen under settings. */
export function provideRulesScope() {
  return provideTranslocoScope({
    scope: 'rules',
    loader: { en: () => import('./i18n/en.json'), es: () => import('./i18n/es.json') },
  })
}
