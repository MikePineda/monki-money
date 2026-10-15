import { provideTranslocoScope } from '@jsverse/transloco'

/**
 * The `transactionForm` Transloco scope: the transaction and transfer forms
 * shared by the transactions sheets and quick add. Each form provides it,
 * so whichever screen hosts a form gets its words.
 */
export function provideTransactionFormI18n() {
  return provideTranslocoScope({
    scope: 'transactionForm',
    loader: { en: () => import('./i18n/en.json'), es: () => import('./i18n/es.json') },
  })
}
