import { provideTranslocoScope } from '@jsverse/transloco'

/** The `scan` catalogue: the receipt scanner's capture and review. */
export function provideScanScope() {
  return provideTranslocoScope({
    scope: 'scan',
    loader: { en: () => import('./i18n/en.json'), es: () => import('./i18n/es.json') },
  })
}
