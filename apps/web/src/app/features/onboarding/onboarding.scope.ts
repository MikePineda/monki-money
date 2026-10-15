import { provideTranslocoScope } from '@jsverse/transloco'

/** The `onboarding` catalogue (the four-step wizard). */
export function provideOnboardingScope() {
  return provideTranslocoScope({
    scope: 'onboarding',
    loader: { en: () => import('./i18n/en.json'), es: () => import('./i18n/es.json') },
  })
}
