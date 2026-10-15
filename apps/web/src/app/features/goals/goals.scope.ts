import { provideTranslocoScope } from '@jsverse/transloco'

/** The `goals` catalogue (list, form, detail). */
export function provideGoalsScope() {
  return provideTranslocoScope({
    scope: 'goals',
    loader: { en: () => import('./i18n/en.json'), es: () => import('./i18n/es.json') },
  })
}
