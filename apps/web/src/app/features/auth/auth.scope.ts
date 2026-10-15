import { provideTranslocoScope } from '@jsverse/transloco'

/** The `auth` catalogue (login, sign-up, verification, password reset, household states). */
export function provideAuthScope() {
  return provideTranslocoScope({
    scope: 'auth',
    loader: { en: () => import('./i18n/en.json'), es: () => import('./i18n/es.json') },
  })
}
