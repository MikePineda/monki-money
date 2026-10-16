import { provideTranslocoScope } from '@jsverse/transloco'

/** The `payslips` catalogue (list and form). */
export function providePayslipsScope() {
  return provideTranslocoScope({
    scope: 'payslips',
    loader: { en: () => import('./i18n/en.json'), es: () => import('./i18n/es.json') },
  })
}
