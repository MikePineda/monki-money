import { provideTranslocoScope } from '@jsverse/transloco'

/** The `recurring` catalogue (the list, its sheets and toasts). */
export function provideRecurringScope() {
  return provideTranslocoScope({
    scope: 'recurring',
    loader: { en: () => import('./i18n/en.json'), es: () => import('./i18n/es.json') },
  })
}
