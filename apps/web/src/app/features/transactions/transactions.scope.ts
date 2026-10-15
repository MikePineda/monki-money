import { provideTranslocoScope } from '@jsverse/transloco'

/**
 * The `transactions` catalogue: the list, its filters and sheets, and the
 * transaction and transfer forms. A screen that hosts the forms (quick add)
 * provides it too.
 */
export function provideTransactionsScope() {
  return provideTranslocoScope({
    scope: 'transactions',
    loader: { en: () => import('./i18n/en.json'), es: () => import('./i18n/es.json') },
  })
}
