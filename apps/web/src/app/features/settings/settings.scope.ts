import { provideTranslocoScope } from '@jsverse/transloco'

/** The `settings` catalogue (settings, password, accounts, upgrade). */
export function provideSettingsScope() {
  return provideTranslocoScope({
    scope: 'settings',
    loader: { en: () => import('./i18n/en.json'), es: () => import('./i18n/es.json') },
  })
}
