import { provideTranslocoScope } from '@jsverse/transloco'

/** The `month` catalogue (the Month view and its "Committed this month" card). */
export function provideMonthScope() {
  return provideTranslocoScope({
    scope: 'month',
    loader: { en: () => import('./i18n/en.json'), es: () => import('./i18n/es.json') },
  })
}
